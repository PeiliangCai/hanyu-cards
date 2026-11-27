import type { StudySession, WordProgress } from '@/types/learning'

export interface ProgressData {
    records: Record<string, WordProgress>
    sessions: StudySession[]
    dailyGoal: number
    completedScenarioIds: string[]
}

export interface ProgressBackup {
    format: 'hanyu-cards-progress'
    version: 1
    exportedAt: string
    data: ProgressData
}

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const MAX_PROGRESS_COUNT = 1_000_000_000
const maxRecords = 10_000
const maxSessions = 36_600
const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor'])
const grades = new Set(['again', 'hard', 'good', 'easy'])
const statuses = new Set(['new', 'learning', 'reviewing', 'mastered'])

function invalid(field: string): never {
    throw new Error(`Invalid learning data: ${field}. Your existing progress has not been replaced.`)
}

function object(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        invalid(field)

    return value as Record<string, unknown>
}

function count(value: unknown, field: string, maximum = MAX_PROGRESS_COUNT): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
        invalid(field)

    return value
}

export function isProgressId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) && !forbiddenIds.has(value)
}

function timestamp(value: unknown, field: string): string {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
        invalid(field)

    return value
}

export function validateProgressData(value: unknown): ProgressData {
    const source = object(value, 'progress')
    const rawRecords = object(source.records, 'word records')
    const entries = Object.entries(rawRecords)
    if (entries.length > maxRecords)
        invalid('too many word records')

    const records: Record<string, WordProgress> = Object.create(null)
    for (const [id, value] of entries) {
        const record = object(value, 'word record')
        if (!isProgressId(id) || record.wordId !== id)
            invalid('word identifier')

        const reviews = count(record.reviews, 'review count')
        const correct = count(record.correct, 'correct count', reviews)
        const streak = count(record.streak, 'review streak', correct)
        if (typeof record.ease !== 'number' || !Number.isFinite(record.ease) || record.ease < 1.3 || record.ease > 3.2)
            invalid('review ease')
        if (typeof record.status !== 'string' || !statuses.has(record.status))
            invalid('review status')
        if (record.lastGrade !== undefined && (typeof record.lastGrade !== 'string' || !grades.has(record.lastGrade)))
            invalid('review grade')

        records[id] = {
            wordId: id,
            reviews,
            correct,
            streak,
            ease: record.ease,
            status: record.status as WordProgress['status'],
        }
        if (record.lastGrade !== undefined)
            records[id].lastGrade = record.lastGrade as WordProgress['lastGrade']
        if (record.lastReviewedAt !== undefined)
            records[id].lastReviewedAt = timestamp(record.lastReviewedAt, 'last review date')
        if (record.nextReviewAt !== undefined)
            records[id].nextReviewAt = timestamp(record.nextReviewAt, 'next review date')
    }

    if (!Array.isArray(source.sessions) || source.sessions.length > maxSessions)
        invalid('study sessions')

    const dates = new Set<string>()
    const sessions = source.sessions.map((value) => {
        const session = object(value, 'study session')
        if (typeof session.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)
            || !Number.isFinite(Date.parse(`${session.date}T00:00:00.000Z`))
            || new Date(`${session.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== session.date
            || dates.has(session.date))
            invalid('study date or duplicate session')

        dates.add(session.date)
        const reviewed = count(session.reviewed, 'session reviews')

        return {
            date: session.date,
            reviewed,
            correct: count(session.correct, 'session correct count', reviewed),
            xp: count(session.xp, 'session XP', Math.min(MAX_PROGRESS_COUNT, reviewed * 8)),
        }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const dailyGoal = count(source.dailyGoal, 'daily goal', 120)
    if (dailyGoal < 5)
        invalid('daily goal (must be 5–120)')

    // Early versions did not store completed missions.
    const completed = source.completedScenarioIds ?? []
    if (!Array.isArray(completed) || completed.length > maxRecords || !completed.every(isProgressId))
        invalid('completed missions')
    if (new Set(completed).size !== completed.length)
        invalid('duplicate completed missions')

    return { records, sessions, dailyGoal, completedScenarioIds: [...completed] }
}

function ensureSize(serialized: string) {
    if (serialized.length > MAX_BACKUP_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES)
        throw new Error('The backup is too large. Choose a HanYu Cards JSON backup smaller than 5 MB.')
}

export function serializeProgressBackup(data: ProgressData, now = new Date()): string {
    const backup: ProgressBackup = {
        format: 'hanyu-cards-progress',
        version: 1,
        exportedAt: now.toISOString(),
        data: validateProgressData(data),
    }
    const serialized = JSON.stringify(backup, null, 2)
    ensureSize(serialized)

    return serialized
}

export function parseProgressBackup(serialized: string): ProgressBackup {
    ensureSize(serialized)
    let parsed: unknown
    try {
        parsed = JSON.parse(serialized)
    }
    catch {
        throw new Error('This file is not valid JSON. Choose a HanYu Cards progress backup.')
    }
    const source = object(parsed, 'backup')
    if (source.format !== 'hanyu-cards-progress')
        throw new Error('This is not a HanYu Cards progress backup.')
    if (source.version !== 1)
        throw new Error('This backup version is not supported. Update HanYu Cards before importing it.')

    return {
        format: 'hanyu-cards-progress',
        version: 1,
        exportedAt: timestamp(source.exportedAt, 'export date'),
        data: validateProgressData(source.data),
    }
}

export function parseStoredProgress(value: unknown): { data: ProgressData, revision: number } {
    const source = object(value, 'stored progress')
    if (!Object.hasOwn(source, 'version'))
        return { data: validateProgressData(source), revision: 0 }
    if (source.version !== 1)
        invalid('unsupported stored progress version')

    return {
        data: validateProgressData(source.data),
        revision: count(source.revision, 'storage revision', Number.MAX_SAFE_INTEGER - 1),
    }
}

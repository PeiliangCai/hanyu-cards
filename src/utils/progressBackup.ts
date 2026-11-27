import type {
    DailyStudyPlan,
    PracticeMode,
    PracticeModeStats,
    ScenarioEvaluationDimensions,
    ScenarioProgress,
    StudySession,
    WordProgress,
} from '@/types/learning'
import { type LearningPreferences, validatePreferences } from '@/stores/settings'

export interface ProgressData {
    records: Record<string, WordProgress>
    sessions: StudySession[]
    dailyGoal: number
    completedScenarioIds: string[]
    dailyPlans?: Record<string, DailyStudyPlan>
    practiceStats?: Record<PracticeMode, PracticeModeStats>
    scenarioProgress?: Record<string, ScenarioProgress>
    lastSavedAt?: string
}

export interface ProgressBackup {
    format: 'hanyu-cards-progress'
    version: 1
    exportedAt: string
    data: ProgressData
    preferences?: LearningPreferences
}

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const MAX_PROGRESS_COUNT = 1_000_000_000
const maxRecords = 10_000
const maxSessions = 36_600
const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor'])
const grades = new Set(['again', 'hard', 'good', 'easy'])
const statuses = new Set(['new', 'learning', 'reviewing', 'mastered'])

export const practiceModes: PracticeMode[] = ['meaning', 'hanzi', 'pinyin', 'listening', 'context']

export function emptyPracticeStats(): Record<PracticeMode, PracticeModeStats> {
    return Object.fromEntries(practiceModes.map((mode) => [mode, { attempts: 0, correct: 0 }])) as Record<PracticeMode, PracticeModeStats>
}

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

function calendarDate(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
        || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)
        invalid('calendar date')

    return value
}

function ids(value: unknown, field: string, maximum = maxRecords): string[] {
    if (!Array.isArray(value) || value.length > maximum || !value.every(isProgressId) || new Set(value).size !== value.length)
        invalid(field)

    return [...value]
}

function dimensions(value: unknown): ScenarioEvaluationDimensions {
    const source = object(value, 'mission dimensions')

    return {
        completeness: count(source.completeness, 'mission coverage', 100),
        naturalness: count(source.naturalness, 'mission naturalness', 100),
        accuracy: count(source.accuracy, 'mission accuracy', 100),
    }
}

function additionalProgress(source: Record<string, unknown>): Partial<ProgressData> {
    const result: Partial<ProgressData> = {}
    if (source.lastSavedAt !== undefined)
        result.lastSavedAt = timestamp(source.lastSavedAt, 'last save date')
    if (source.practiceStats !== undefined) {
        const raw = object(source.practiceStats, 'practice statistics')
        result.practiceStats = emptyPracticeStats()
        for (const mode of practiceModes) {
            if (raw[mode] === undefined)
                continue
            const stats = object(raw[mode], 'practice mode')
            const attempts = count(stats.attempts, 'practice attempts')
            result.practiceStats[mode] = { attempts, correct: count(stats.correct, 'practice correct count', attempts) }
        }
    }
    if (source.dailyPlans !== undefined) {
        const entries = Object.entries(object(source.dailyPlans, 'daily plans'))
        if (entries.length > maxSessions)
            invalid('too many daily plans')
        const plans: Record<string, DailyStudyPlan> = Object.create(null)
        for (const [key, value] of entries) {
            const raw = object(value, 'daily plan')
            const date = calendarDate(raw.date)
            if (raw.level !== 'all' && raw.level !== 1 && raw.level !== 2 && raw.level !== 3)
                invalid('daily plan level')
            if (raw.key !== key || ![`${date}:all`, `${date}:1`, `${date}:2`, `${date}:3`].includes(key))
                invalid('daily plan identifier')
            const wordIds = ids(raw.wordIds, 'daily words', 120)
            const completedWordIds = ids(raw.completedWordIds, 'completed daily words', 120)
            if (completedWordIds.some((id) => !wordIds.includes(id)))
                invalid('completed word outside daily plan')
            const goal = count(raw.goal, 'daily plan goal', 120)
            if (goal !== wordIds.length)
                invalid('daily plan goal does not match its words')
            const results: DailyStudyPlan['results'] = Object.create(null)
            for (const [id, grade] of Object.entries(object(raw.results, 'daily results'))) {
                if (!completedWordIds.includes(id) || typeof grade !== 'string' || !grades.has(grade))
                    invalid('daily result')
                results[id] = grade as DailyStudyPlan['results'][string]
            }
            if (completedWordIds.some((id) => results[id] === undefined))
                invalid('missing daily result')
            const canonicalKey = `${date}:all`
            const plan: DailyStudyPlan = {
                key: canonicalKey, date, level: raw.level, goal, wordIds, completedWordIds, results,
                createdAt: timestamp(raw.createdAt, 'daily plan creation date'),
            }
            if (raw.completedAt !== undefined) {
                if (completedWordIds.length !== goal)
                    invalid('unfinished daily plan marked complete')
                plan.completedAt = timestamp(raw.completedAt, 'daily completion date')
            }
            // Older builds used one plan per level. Keep the most advanced daily route.
            const current = plans[canonicalKey]
            if (!current || plan.completedWordIds.length > current.completedWordIds.length
                || (plan.completedWordIds.length === current.completedWordIds.length && plan.createdAt < current.createdAt))
                plans[canonicalKey] = plan
        }
        result.dailyPlans = plans
    }
    if (source.scenarioProgress !== undefined) {
        const entries = Object.entries(object(source.scenarioProgress, 'mission progress'))
        if (entries.length > maxRecords)
            invalid('too many missions')
        const missions: Record<string, ScenarioProgress> = Object.create(null)
        for (const [id, value] of entries) {
            const raw = object(value, 'mission result')
            if (!isProgressId(id) || raw.scenarioId !== id)
                invalid('mission identifier')
            if (typeof raw.followUp !== 'string' || raw.followUp.length > 500
                || !['agicto', 'local', 'mock'].includes(String(raw.source)))
                invalid('mission feedback')
            const bestScore = count(raw.bestScore, 'best mission score', 100)
            missions[id] = {
                scenarioId: id,
                attempts: count(raw.attempts, 'mission attempts'),
                bestScore,
                lastScore: count(raw.lastScore, 'last mission score', bestScore),
                lastAttemptAt: timestamp(raw.lastAttemptAt, 'mission attempt date'),
                bestDimensions: dimensions(raw.bestDimensions),
                followUp: raw.followUp,
                source: raw.source as ScenarioProgress['source'],
            }
        }
        result.scenarioProgress = missions
    }

    return result
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
        if (record.mistakeCount !== undefined)
            records[id].mistakeCount = count(record.mistakeCount, 'mistake count', reviews)
        if (record.lastMistakeAt !== undefined)
            records[id].lastMistakeAt = timestamp(record.lastMistakeAt, 'last mistake date')
        if (record.needsMistakeReview !== undefined && typeof record.needsMistakeReview !== 'boolean')
            invalid('mistake review state')
        if (record.needsMistakeReview !== undefined || record.lastGrade === 'again')
            records[id].needsMistakeReview = record.needsMistakeReview === true
                || (record.needsMistakeReview === undefined && record.lastGrade === 'again')
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

        const result: StudySession = {
            date: session.date,
            reviewed,
            correct: count(session.correct, 'session correct count', reviewed),
            xp: count(session.xp, 'session XP', Math.min(MAX_PROGRESS_COUNT, reviewed * 8)),
        }
        if (session.studySeconds !== undefined)
            result.studySeconds = count(session.studySeconds, 'study seconds', 86_400)
        if (session.extraWordIds !== undefined)
            result.extraWordIds = ids(session.extraWordIds, 'extra study words')

        return result
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

    return { records, sessions, dailyGoal, completedScenarioIds: [...completed], ...additionalProgress(source) }
}

function ensureSize(serialized: string) {
    if (serialized.length > MAX_BACKUP_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES)
        throw new Error('The backup is too large. Choose a HanYu Cards JSON backup smaller than 5 MB.')
}

export function serializeProgressBackup(data: ProgressData, now = new Date(), preferences?: LearningPreferences): string {
    const backup: ProgressBackup = {
        format: 'hanyu-cards-progress',
        version: 1,
        exportedAt: now.toISOString(),
        data: validateProgressData(data),
    }
    if (preferences)
        backup.preferences = validatePreferences(preferences)
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
    const legacyRenderBackup = source.format === undefined && source.app === 'hanyu-cards'
    if (source.format !== 'hanyu-cards-progress' && !legacyRenderBackup)
        throw new Error('This is not a HanYu Cards progress backup.')
    if (source.version !== 1)
        throw new Error('This backup version is not supported. Update HanYu Cards before importing it.')

    const preferences = legacyRenderBackup ? source.settings : source.preferences

    return {
        format: 'hanyu-cards-progress',
        version: 1,
        exportedAt: timestamp(source.exportedAt, 'export date'),
        data: validateProgressData(legacyRenderBackup ? source.progress : source.data),
        ...(preferences === undefined ? {} : { preferences: validatePreferences(preferences) }),
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

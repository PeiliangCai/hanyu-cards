import { defineStore } from 'pinia'
import localforage from 'localforage'
import type {
    HskWord,
    ReviewGrade,
    StudySession,
    WordProgress,
} from '@/types/learning'
import {
    gradeToIntervalDays,
    nextStatus,
    todayKey,
} from '@/utils/learning'
import {
    MAX_PROGRESS_COUNT,
    type ProgressData,
    isProgressId,
    parseProgressBackup,
    parseStoredProgress,
    serializeProgressBackup,
    validateProgressData,
} from '@/utils/progressBackup'

interface ProgressState extends ProgressData {
    hydrated: boolean
    storageError: string | null
    storageBlocked: boolean
}

interface PersistenceContext {
    queue: Promise<unknown>
    hydration?: Promise<void>
    revision: number | null
}

const STORE_KEY = 'hanyu-progress-v1'
const contexts = new WeakMap<object, PersistenceContext>()
const xpByGrade: Record<ReviewGrade, number> = { again: 1, hard: 3, good: 5, easy: 8 }

localforage.config({ name: 'HanYu Cards', storeName: 'learning_progress' })

function contextFor(store: object): PersistenceContext {
    let context = contexts.get(store)
    if (!context) {
        context = { queue: Promise.resolve(), revision: null }
        contexts.set(store, context)
    }

    return context
}

function enqueue<T>(store: object, work: () => Promise<T>): Promise<T> {
    const context = contextFor(store)
    const operation = context.queue.then(work)
    // A failed operation must not prevent later writes or recovery.
    context.queue = operation.catch(() => undefined)

    return operation
}

async function withStorageLock<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks?.request)
        return navigator.locks.request(STORE_KEY, work)

    return work()
}

function applyData(store: ProgressState, data: ProgressData) {
    store.records = data.records
    store.sessions = data.sessions
    store.dailyGoal = data.dailyGoal
    store.completedScenarioIds = data.completedScenarioIds
}

async function writeData(store: ProgressState, data: ProgressData, replace = false): Promise<boolean> {
    if (store.storageBlocked && !replace)
        return false

    try {
        const payload = validateProgressData(data)

        return await withStorageLock(async () => {
            const context = contextFor(store)
            const saved = await localforage.getItem<unknown>(STORE_KEY)
            let revision: number | null = null
            if (saved !== null) {
                try {
                    const { revision: savedRevision } = parseStoredProgress(saved)
                    revision = savedRevision
                }
                catch (error) {
                    if (!replace) {
                        store.storageBlocked = true
                        throw error
                    }
                }
            }
            if (!replace && revision !== context.revision) {
                store.storageBlocked = true
                store.storageError = 'Progress changed in another tab. Export this tab’s progress before reloading to load the latest saved data.'

                return false
            }
            const nextRevision = (revision ?? 0) + 1
            await localforage.setItem(STORE_KEY, { version: 1, revision: nextRevision, data: payload })
            context.revision = nextRevision
            store.storageError = null
            store.storageBlocked = false

            return true
        })
    }
    catch {
        store.storageError = store.storageBlocked
            ? 'Saved progress could not be read safely. Export your current progress before importing a verified backup or resetting local progress.'
            : 'Your latest progress could not be saved on this device. Export a backup before closing, or retry saving in Settings.'

        return false
    }
}

export const useProgressStore = defineStore('progress', {
    state: (): ProgressState => ({
        records: {},
        sessions: [],
        dailyGoal: 24,
        completedScenarioIds: [],
        hydrated: false,
        storageError: null,
        storageBlocked: false,
    }),
    getters: {
        todaySession(state): StudySession {
            return state.sessions.find((session) => session.date === todayKey()) ?? {
                date: todayKey(), reviewed: 0, correct: 0, xp: 0,
            }
        },
        masteredCount(state) {
            return Object.values(state.records).filter((record) => record.status === 'mastered').length
        },
        reviewedCount(state) {
            return Object.values(state.records).filter((record) => record.reviews > 0).length
        },
        accuracy(state) {
            const reviewed = Object.values(state.records).reduce((sum, record) => sum + record.reviews, 0)
            const correct = Object.values(state.records).reduce((sum, record) => sum + record.correct, 0)

            return reviewed ? Math.round((correct / reviewed) * 100) : 0
        },
    },
    actions: {
        async hydrate() {
            if (this.hydrated)
                return
            const context = contextFor(this)
            if (context.hydration)
                return context.hydration

            context.hydration = (async () => {
                try {
                    const saved = await localforage.getItem<unknown>(STORE_KEY)
                    if (saved !== null) {
                        const parsed = parseStoredProgress(saved)
                        applyData(this, parsed.data)
                        context.revision = parsed.revision
                    }
                }
                catch {
                    this.storageBlocked = true
                    this.storageError = 'Saved progress could not be loaded. You can keep studying, but new progress is only in memory. Export a backup before closing; reload to retry, or restore a verified backup in Settings.'
                }
                finally {
                    this.hydrated = true
                }
            })()

            return context.hydration
        },
        async persist() {
            await this.hydrate()

            return enqueue(this, () => writeData(this, this))
        },
        async reviewWord(word: HskWord, grade: ReviewGrade) {
            if (!isProgressId(word.id) || !Object.hasOwn(xpByGrade, grade))
                return false
            await this.hydrate()

            return enqueue(this, async () => {
                const previous = this.records[word.id] ?? {
                    wordId: word.id, reviews: 0, correct: 0, streak: 0, ease: 2.5, status: 'new',
                } satisfies WordProgress
                const isCorrect = grade !== 'again'
                const streak = isCorrect ? Math.min(MAX_PROGRESS_COUNT, previous.streak + 1) : 0
                const reviews = Math.min(MAX_PROGRESS_COUNT, previous.reviews + 1)
                const easeDelta = grade === 'easy' ? 0.18 : grade === 'good' ? 0.05 : grade === 'hard' ? -0.08 : -0.22
                const ease = Math.max(1.3, Math.min(3.2, previous.ease + easeDelta))
                const intervalDays = gradeToIntervalDays(grade, streak) * ease / 2.5
                this.records[word.id] = {
                    ...previous,
                    reviews,
                    correct: Math.min(MAX_PROGRESS_COUNT, previous.correct + (isCorrect ? 1 : 0)),
                    streak,
                    ease,
                    lastGrade: grade,
                    lastReviewedAt: new Date().toISOString(),
                    nextReviewAt: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
                    status: nextStatus(grade, reviews, streak),
                }
                const date = todayKey()
                let session = this.sessions.find((item) => item.date === date)
                if (!session) {
                    session = { date, reviewed: 0, correct: 0, xp: 0 }
                    this.sessions.push(session)
                }
                session.reviewed = Math.min(MAX_PROGRESS_COUNT, session.reviewed + 1)
                session.correct = Math.min(MAX_PROGRESS_COUNT, session.correct + (isCorrect ? 1 : 0))
                session.xp = Math.min(MAX_PROGRESS_COUNT, session.xp + xpByGrade[grade])

                return writeData(this, this)
            })
        },
        async setDailyGoal(value: number) {
            if (!Number.isFinite(value))
                return false
            await this.hydrate()

            return enqueue(this, async () => {
                this.dailyGoal = Math.max(5, Math.min(120, Math.round(value)))

                return writeData(this, this)
            })
        },
        async completeScenario(scenarioId: string) {
            if (!isProgressId(scenarioId))
                return false
            await this.hydrate()

            return enqueue(this, async () => {
                if (!this.completedScenarioIds.includes(scenarioId))
                    this.completedScenarioIds.push(scenarioId)

                return writeData(this, this)
            })
        },
        async exportBackup() {
            await this.hydrate()

            return enqueue(this, async () => serializeProgressBackup(this))
        },
        async importBackup(serialized: string) {
            // Validate before touching either the in-memory state or stored data.
            const backup = parseProgressBackup(serialized)
            await this.hydrate()

            return enqueue(this, async () => {
                if (!await writeData(this, backup.data, true))
                    return false
                applyData(this, backup.data)

                return true
            })
        },
        async resetProgress() {
            await this.hydrate()

            return enqueue(this, async () => {
                const empty: ProgressData = { records: {}, sessions: [], dailyGoal: this.dailyGoal, completedScenarioIds: [] }
                if (!await writeData(this, empty, true))
                    return false
                applyData(this, empty)

                return true
            })
        },
    },
})

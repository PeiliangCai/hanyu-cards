import { createPinia, setActivePinia } from 'pinia'
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import type { HskWord } from '@/types/learning'
import { useProgressStore } from '@/stores/progress'
import {
    type ProgressData,
    parseProgressBackup,
    serializeProgressBackup,
} from '@/utils/progressBackup'

const storage = vi.hoisted(() => ({ value: null as unknown, get: vi.fn(), set: vi.fn() }))
vi.mock('localforage', () => ({ default: { config: vi.fn(), getItem: storage.get, setItem: storage.set } }))

const word: HskWord = {
    id: 'hsk1-0001', level: 1, simplified: '爱', traditional: '愛', pinyin: 'ài', numericPinyin: 'ai4',
    english: 'love', partOfSpeech: ['v'], radical: '', examples: [], tags: [],
}
const initialData = (): ProgressData => ({ records: {}, sessions: [], dailyGoal: 24, completedScenarioIds: [] })
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.stubGlobal('navigator', {})
    storage.value = null
    storage.get.mockImplementation(async () => clone(storage.value))
    storage.set.mockImplementation(async (_key: string, value: unknown) => {
        storage.value = clone(value)

        return value
    })
})

describe('progress persistence', () => {
    it('migrates legacy state when saving and retains existing reviews', async () => {
        storage.value = { ...initialData(), completedScenarioIds: ['first-meeting'], dailyGoal: 40 }
        const progress = useProgressStore()
        await progress.hydrate()
        await progress.reviewWord(word, 'good')
        expect(progress.dailyGoal).toBe(40)
        expect(progress.completedScenarioIds).toEqual(['first-meeting'])
        expect(storage.value).toMatchObject({ version: 1, revision: 1, data: { dailyGoal: 40 } })
        const restored = useProgressStore(createPinia())
        await restored.hydrate()
        expect(restored.records[word.id].reviews).toBe(1)
    })

    it('coalesces hydration and waits for it before accepting reviews', async () => {
        let release!: (value: unknown) => void
        storage.get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
        const progress = useProgressStore()
        const hydration = progress.hydrate()
        const review = progress.reviewWord(word, 'good')
        const hydrationAgain = progress.hydrate()
        expect(storage.get).toHaveBeenCalledTimes(1)
        expect(progress.records[word.id]).toBeUndefined()
        release(null)
        await Promise.all([hydration, review, hydrationAgain])
        expect(progress.records[word.id].reviews).toBe(1)
    })

    it('keeps the app usable and prevents automatic overwrite when reads fail', async () => {
        storage.get.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
        const progress = useProgressStore()
        await expect(progress.hydrate()).resolves.toBeUndefined()
        expect(progress.hydrated).toBe(true)
        expect(progress.storageBlocked).toBe(true)
        expect(progress.storageError).toContain('could not be loaded')
        await expect(progress.reviewWord(word, 'good')).resolves.toBe(false)
        expect(progress.records[word.id].reviews).toBe(1)
        expect(storage.set).not.toHaveBeenCalled()
        expect(parseProgressBackup(await progress.exportBackup()).data.records[word.id].reviews).toBe(1)
    })

    it('preserves damaged stored data until an explicitly requested reset or restore', async () => {
        storage.value = { ...initialData(), dailyGoal: null }
        const original = clone(storage.value)
        const progress = useProgressStore()
        await progress.hydrate()
        await progress.completeScenario('first-meeting')
        expect(storage.value).toEqual(original)
        expect(progress.storageBlocked).toBe(true)
        expect(await progress.resetProgress()).toBe(true)
        expect(progress.storageBlocked).toBe(false)
        expect(progress.storageError).toBeNull()
        expect(storage.value).toMatchObject({ version: 1, data: initialData() })
    })

    it('retains unsaved learning in memory and supports a successful retry', async () => {
        const progress = useProgressStore()
        storage.set.mockRejectedValueOnce(new Error('Quota exceeded'))
        await expect(progress.reviewWord(word, 'easy')).resolves.toBe(false)
        expect(progress.records[word.id].reviews).toBe(1)
        expect(progress.storageError).toContain('could not be saved')
        expect(progress.storageBlocked).toBe(false)
        expect(await progress.persist()).toBe(true)
        expect(progress.storageError).toBeNull()
        expect(storage.value).toMatchObject({ data: { records: { [word.id]: { reviews: 1 } } } })
    })

    it('serializes concurrent reviews so a slow write cannot replace newer progress', async () => {
        let finish!: () => void
        storage.set.mockImplementationOnce(async (_key: string, value: unknown) => {
            await new Promise<void>((resolve) => { finish = resolve })
            storage.value = clone(value)

            return value
        })
        const progress = useProgressStore()
        const first = progress.reviewWord(word, 'good')
        const second = progress.reviewWord(word, 'easy')
        await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1))
        expect(progress.records[word.id].reviews).toBe(1)
        finish()
        await Promise.all([first, second])
        expect(storage.value).toMatchObject({ revision: 2, data: { records: { [word.id]: { reviews: 2 } } } })
    })

    it('blocks a stale tab from overwriting a newer saved revision', async () => {
        const first = useProgressStore()
        const second = useProgressStore(createPinia())
        await Promise.all([first.hydrate(), second.hydrate()])
        await first.reviewWord(word, 'good')
        const saved = clone(storage.value)
        expect(await second.setDailyGoal(50)).toBe(false)
        expect(second.storageBlocked).toBe(true)
        expect(second.storageError).toContain('another tab')
        expect(storage.value).toEqual(saved)
    })

    it('uses an origin-wide Web Lock when the browser supports it', async () => {
        const request = vi.fn(async (_name: string, work: () => Promise<unknown>) => work())
        vi.stubGlobal('navigator', { locks: { request } })
        await useProgressStore().reviewWord(word, 'good')
        expect(request).toHaveBeenCalledWith('hanyu-progress-v1', expect.any(Function))
    })

    it('does not replace valid data with a damaged backup', async () => {
        const progress = useProgressStore()
        await progress.reviewWord(word, 'good')
        const before = clone(storage.value)
        const backup = JSON.parse(await progress.exportBackup())
        backup.data.records[word.id].correct = -1
        await expect(progress.importBackup(JSON.stringify(backup))).rejects.toThrow('correct count')
        expect(progress.records[word.id].reviews).toBe(1)
        expect(storage.value).toEqual(before)
    })

    it('imports only after durable storage succeeds', async () => {
        const progress = useProgressStore()
        await progress.reviewWord(word, 'good')
        const before = clone(storage.value)
        storage.set.mockRejectedValueOnce(new Error('disk full'))
        expect(await progress.importBackup(serializeProgressBackup({ ...initialData(), dailyGoal: 80 }))).toBe(false)
        expect(progress.records[word.id].reviews).toBe(1)
        expect(progress.dailyGoal).toBe(24)
        expect(storage.value).toEqual(before)
    })

    it('restores a backup and applies subsequent reviews to the imported state', async () => {
        const progress = useProgressStore()
        await progress.reviewWord(word, 'good')
        const restore = progress.importBackup(serializeProgressBackup({ ...initialData(), dailyGoal: 80 }))
        const review = progress.reviewWord(word, 'again')
        await Promise.all([restore, review])
        expect(progress.records[word.id].reviews).toBe(1)
        expect(progress.records[word.id].correct).toBe(0)
        expect(progress.dailyGoal).toBe(80)
        const restored = useProgressStore(createPinia())
        await restored.hydrate()
        expect(restored.records).toEqual(progress.records)
    })

    it('does not delete progress when reset cannot be persisted', async () => {
        const progress = useProgressStore()
        await progress.reviewWord(word, 'good')
        storage.set.mockRejectedValueOnce(new Error('storage unavailable'))
        expect(await progress.resetProgress()).toBe(false)
        expect(progress.records[word.id].reviews).toBe(1)
    })

    it('rejects nonfinite goals and unsafe identifiers without saving', async () => {
        const progress = useProgressStore()
        for (const value of [NaN, Infinity, -Infinity])
            expect(await progress.setDailyGoal(value)).toBe(false)
        expect(progress.dailyGoal).toBe(24)
        expect(await progress.completeScenario('__proto__')).toBe(false)
        expect(await progress.reviewWord({ ...word, id: 'constructor' }, 'good')).toBe(false)
        expect(storage.set).not.toHaveBeenCalled()
        await progress.setDailyGoal(999)
        expect(progress.dailyGoal).toBe(120)
        await progress.setDailyGoal(5.9)
        expect(progress.dailyGoal).toBe(6)
    })

    it('keeps study history beyond 120 days so total XP is not silently lost', async () => {
        const data = initialData()
        data.sessions = Array.from({ length: 130 }, (_, index) => ({
            date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), reviewed: 1, correct: 1, xp: 5,
        }))
        storage.value = data
        const progress = useProgressStore()
        await progress.hydrate()
        await progress.persist()
        const exported = parseProgressBackup(await progress.exportBackup())
        expect(exported.data.sessions).toHaveLength(130)
        const restored = useProgressStore(createPinia())
        await restored.hydrate()
        expect(restored.sessions).toHaveLength(130)
    })
})

import {
    describe,
    expect,
    it,
} from 'vitest'
import {
    MAX_BACKUP_BYTES,
    type ProgressData,
    parseProgressBackup,
    parseStoredProgress,
    serializeProgressBackup,
    validateProgressData,
} from '@/utils/progressBackup'

function data(): ProgressData {
    return {
        dailyGoal: 24,
        records: {
            'hsk1-0001': {
                wordId: 'hsk1-0001', reviews: 8, correct: 7, streak: 6, ease: 2.5,
                status: 'mastered', lastGrade: 'good',
                lastReviewedAt: '2026-01-02T00:00:00.000Z', nextReviewAt: '2026-01-17T00:00:00.000Z',
            },
        },
        sessions: [{ date: '2026-01-02', reviewed: 8, correct: 7, xp: 40 }],
        completedScenarioIds: ['first-meeting'],
    }
}

function backupWith(value: unknown): string {
    return JSON.stringify({ format: 'hanyu-cards-progress', version: 1, exportedAt: '2026-01-02T00:00:00.000Z', data: value })
}

describe('progress backup validation', () => {
    it('round trips a versioned backup without chat or device preferences', () => {
        const source = { ...data(), chatMessages: ['private'], assistantEnabled: true }
        const serialized = serializeProgressBackup(source, new Date('2026-01-03T00:00:00.000Z'))
        const backup = parseProgressBackup(serialized)
        expect(backup.data).toEqual(data())
        expect(backup.version).toBe(1)
        expect(backup.exportedAt).toBe('2026-01-03T00:00:00.000Z')
        expect(serialized).not.toContain('private')
        expect(serialized).not.toContain('assistantEnabled')
    })

    it.each([NaN, Infinity, -1, 4, 121, 10.5, '24', null])('rejects unsafe goal %s', (goal) => {
        expect(() => validateProgressData({ ...data(), dailyGoal: goal })).toThrow('daily goal')
    })

    it('rejects inconsistent review counts, identifiers, and invalid schedules', () => {
        for (const patch of [{ correct: 9 }, { streak: 8 }, { wordId: 'other' }, { reviews: -1 }, { ease: 999 }, { nextReviewAt: 'tomorrow' }, { lastGrade: 'perfect' }]) {
            const source = data()
            Object.assign(source.records['hsk1-0001'], patch)
            expect(() => parseProgressBackup(backupWith(source))).toThrow('Invalid learning data')
        }
    })

    it('rejects impossible dates, duplicate study days, and impossible session totals', () => {
        for (const patch of [{ date: '2026-02-30' }, { correct: 9 }, { reviewed: 1.5 }, { xp: 65 }]) {
            const source = data()
            Object.assign(source.sessions[0], patch)
            expect(() => validateProgressData(source)).toThrow()
        }
        const source = data()
        source.sessions.push({ ...source.sessions[0] })
        expect(() => validateProgressData(source)).toThrow('duplicate session')
    })

    it('rejects special object keys and duplicated missions', () => {
        const source = data()
        source.records = JSON.parse('{"__proto__":{"wordId":"__proto__"}}')
        expect(() => validateProgressData(source)).toThrow('word identifier')
        expect(() => validateProgressData({ ...data(), completedScenarioIds: ['constructor'] })).toThrow('missions')
        expect(() => validateProgressData({ ...data(), completedScenarioIds: ['first-meeting', 'first-meeting'] })).toThrow('duplicate')
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it('rejects unrecognized formats, versions, and malformed JSON', () => {
        const backup = JSON.parse(backupWith(data()))
        expect(() => parseProgressBackup('{')).toThrow('not valid JSON')
        expect(() => parseProgressBackup(JSON.stringify({ ...backup, format: 'other' }))).toThrow('not a HanYu')
        expect(() => parseProgressBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow('version is not supported')
    })

    it('limits bytes before JSON parsing, including multibyte characters', () => {
        expect(() => parseProgressBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow('too large')
        expect(() => parseProgressBackup('汉'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3)))).toThrow('too large')
    })

    it('accepts legacy storage and adds missing mission progress without changing reviews', () => {
        const source = data()
        const legacy: Partial<ProgressData> = { ...source }
        delete legacy.completedScenarioIds
        const parsed = parseStoredProgress(legacy)
        expect(parsed.revision).toBe(0)
        expect(parsed.data.records).toEqual(source.records)
        expect(parsed.data.completedScenarioIds).toEqual([])
    })

    it('rejects unknown storage versions and invalid revisions', () => {
        expect(() => parseStoredProgress({ version: 2, revision: 1, data: data() })).toThrow('unsupported')
        expect(() => parseStoredProgress({ version: 1, revision: -1, data: data() })).toThrow('revision')
    })

    it('migrates render backups, preserving daily results, mistakes and skills without restoring online consent', () => {
        const progress = {
            ...data(),
            dailyPlans: {
                '2026-01-02:1': {
                    key: '2026-01-02:1', date: '2026-01-02', level: 1, goal: 1,
                    wordIds: ['hsk1-0001'], completedWordIds: ['hsk1-0001'],
                    results: { 'hsk1-0001': 'again' }, createdAt: '2026-01-02T00:00:00.000Z',
                },
            },
            practiceStats: { pinyin: { attempts: 3, correct: 2 } },
        }
        Object.assign(progress.records['hsk1-0001'], { lastGrade: 'again', streak: 0, mistakeCount: 1 })
        const backup = parseProgressBackup(JSON.stringify({
            app: 'hanyu-cards', version: 1, exportedAt: '2026-01-03T00:00:00.000Z', progress,
            settings: { ttsEnabled: true, assistantEnabled: true, showTraditional: true, dailyStudyLevel: 2, onlineAssistantEnabled: true },
        }))
        expect(backup.data.dailyPlans?.['2026-01-02:all'].results).toEqual({ 'hsk1-0001': 'again' })
        expect(backup.data.records['hsk1-0001'].needsMistakeReview).toBe(true)
        expect(backup.data.practiceStats?.pinyin).toEqual({ attempts: 3, correct: 2 })
        expect(backup.data.practiceStats?.context).toEqual({ attempts: 0, correct: 0 })
        expect(backup.preferences?.dailyStudyLevel).toBe(2)
        expect(JSON.stringify(backup)).not.toContain('onlineAssistantEnabled')
        expect(parseProgressBackup(serializeProgressBackup(backup.data)).data).toEqual(backup.data)
    })

    it('rejects inconsistent daily plans and unsafe added statistics', () => {
        const plan = {
            key: '2026-01-02:all', date: '2026-01-02', level: 'all', goal: 1,
            wordIds: ['hsk1-0001'], completedWordIds: ['hsk1-0001'],
            results: { 'hsk1-0001': 'good' }, createdAt: '2026-01-02T00:00:00.000Z',
        }
        for (const patch of [{ goal: 2 }, { completedWordIds: ['other'] }, { results: {} }, { results: { 'hsk1-0001': 'perfect' } }, { date: '2026-02-30' }]) {
            expect(() => validateProgressData({ ...data(), dailyPlans: { [plan.key]: { ...plan, ...patch } } })).toThrow('Invalid learning data')
        }
        expect(() => validateProgressData({ ...data(), practiceStats: { meaning: { attempts: 1, correct: 2 } } })).toThrow('practice correct count')
        expect(() => validateProgressData({ ...data(), sessions: [{ ...data().sessions[0], studySeconds: 86_401 }] })).toThrow('study seconds')
        expect(() => validateProgressData({ ...data(), scenarioProgress: JSON.parse('{"__proto__":{}}') })).toThrow('mission identifier')
        expect(() => parseProgressBackup(JSON.stringify({ app: 'hanyu-cards', format: 'other', version: 1 }))).toThrow('not a HanYu')
    })
})

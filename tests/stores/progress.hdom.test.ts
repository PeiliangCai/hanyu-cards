// @vitest-environment happy-dom

import localforage from 'localforage'
import {
    createPinia,
    setActivePinia,
} from 'pinia'
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest'
import type { ScenarioEvaluation } from '@/types/learning'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import {
    dailyPlanKey,
    todayKey,
} from '@/utils/learning'

function evaluation(score: number, passed = true): ScenarioEvaluation {
    return {
        passed,
        score,
        feedback: 'Useful feedback',
        strengths: ['Clear meaning'],
        improvements: [],
        source: 'agicto',
        dimensions: {
            completeness: score,
            naturalness: score - 2,
            accuracy: score - 4,
        },
        followUp: `Follow-up for ${score}`,
    }
}

describe('store/progress learning loop', () => {
    beforeEach(async () => {
        localStorage.clear()
        await localforage.clear()
        setActivePinia(createPinia())
    })

    it('restores the expanded backup and preferences with a fresh save date and online AI disabled', async () => {
        const progress = useProgressStore()
        const settings = useSettingsStore()
        const word = useContentStore().words[0]
        const key = dailyPlanKey(todayKey())
        await progress.ensureDailyPlan(key, todayKey(), 'all', [word.id])
        await progress.reviewWord(word, 'again', { dailyPlanKey: key, practiceMode: 'meaning' })
        await progress.addStudySeconds(70)
        settings.setShowTraditional(true)
        const serialized = await progress.exportBackup()
        await progress.resetProgress()
        settings.setShowTraditional(false)
        settings.setOnlineAssistantEnabled(true)
        const backup = JSON.parse(serialized)
        backup.data.lastSavedAt = '2020-01-01T00:00:00.000Z'
        expect(await progress.importBackup(JSON.stringify(backup))).toBe(true)
        expect(progress.todayPlanCompletedCount).toBe(1)
        expect(progress.activeMistakeCount).toBe(1)
        expect(progress.practiceStats.meaning.attempts).toBe(1)
        expect(progress.totalStudySeconds).toBe(70)
        expect(settings.showTraditional).toBe(true)
        expect(settings.onlineAssistantEnabled).toBe(false)
        expect(progress.lastSavedAt).not.toBe(backup.data.lastSavedAt)
        const saved = await localforage.getItem<{ data: { lastSavedAt: string } }>('hanyu-progress-v1')
        expect(progress.lastSavedAt).toBe(saved?.data.lastSavedAt)
    })

    it('keeps a daily plan stable and resumable once it is created', async () => {
        const content = useContentStore()
        const progress = useProgressStore()
        progress.dailyGoal = 5
        const key = dailyPlanKey(todayKey())

        await progress.ensureDailyPlan(key, todayKey(), 'all', content.words.slice(0, 6).map((word) => word.id))
        await progress.ensureDailyPlan(key, todayKey(), 'all', content.words.slice(6, 12).map((word) => word.id))

        expect(progress.dailyPlans[key].wordIds).toEqual(content.words.slice(0, 5).map((word) => word.id))
        expect(progress.dailyPlans[key].completedWordIds).toEqual([])
    })

    it('rebuilds an unstarted route for a chosen goal but keeps a started route fixed', async () => {
        const content = useContentStore()
        const progress = useProgressStore()
        const key = dailyPlanKey(todayKey())
        const candidates = content.words.slice(0, 30).map((word) => word.id)

        await progress.ensureDailyPlan(key, todayKey(), 'all', candidates)
        expect(progress.todayPlanGoal).toBe(24)

        await progress.setDailyGoal(12)
        expect(progress.todayPlan).toBeUndefined()
        expect(progress.todayPlanGoal).toBe(12)

        await progress.ensureDailyPlan(key, todayKey(), 'all', candidates)
        const firstPlannedWord = content.words.find((word) => word.id === progress.todayPlan?.wordIds[0])
        if (!firstPlannedWord)
            throw new Error('Expected the rebuilt daily route to contain a word')
        await progress.reviewWord(firstPlannedWord, 'good', { dailyPlanKey: key })
        await progress.setDailyGoal(8)

        expect(progress.dailyGoal).toBe(8)
        expect(progress.todayPlanGoal).toBe(12)
        expect(progress.todayPlanCompletedCount).toBe(1)
    })

    it('moves an incorrect word into focused review and clears it after successful recovery', async () => {
        const content = useContentStore()
        const progress = useProgressStore()
        const target = content.words[0]
        const key = dailyPlanKey(todayKey())
        await progress.ensureDailyPlan(key, todayKey(), 'all', [target.id])

        await progress.reviewWord(target, 'again', { dailyPlanKey: key })

        expect(progress.records[target.id]).toMatchObject({
            mistakeCount: 1,
            needsMistakeReview: true,
        })
        expect(progress.dailyPlans[key].completedWordIds).toEqual([target.id])
        expect(progress.todayPlanCompletedCount).toBe(1)

        await progress.reviewWord(target, 'good', { practiceMode: 'meaning', resolveMistake: true })

        expect(progress.records[target.id].needsMistakeReview).toBe(false)
        expect(progress.practiceStats.meaning).toEqual({ attempts: 1, correct: 1 })
        expect(progress.todaySession.reviewed).toBe(2)
        expect(progress.todayPlanCompletedCount).toBe(1)
    })

    it('migrates a legacy level-specific plan into the canonical daily route', async () => {
        const content = useContentStore()
        const progress = useProgressStore()
        const date = todayKey()
        const legacyKey = `${date}:2`
        const wordIds = content.words.filter((word) => word.level === 2).slice(0, 2).map((word) => word.id)

        await progress.importProgress({
            records: {},
            sessions: [],
            dailyGoal: 24,
            completedScenarioIds: [],
            dailyPlans: {
                [legacyKey]: {
                    key: legacyKey,
                    date,
                    level: 2,
                    goal: 2,
                    wordIds,
                    completedWordIds: [wordIds[0]],
                    results: { [wordIds[0]]: 'good' },
                    createdAt: new Date().toISOString(),
                },
            },
            practiceStats: {},
            scenarioProgress: {},
        })

        expect(progress.todayPlan).toMatchObject({
            key: dailyPlanKey(date),
            level: 2,
            completedWordIds: [wordIds[0]],
        })
        expect(progress.todayPlanCompletedCount).toBe(1)
    })

    it('records every mission attempt while preserving the best multidimensional score', async () => {
        const progress = useProgressStore()

        await progress.recordScenarioAttempt('first-meeting', evaluation(88))
        await progress.recordScenarioAttempt('first-meeting', evaluation(72))

        expect(progress.completedScenarioIds).toEqual(['first-meeting'])
        expect(progress.scenarioProgress['first-meeting']).toMatchObject({
            attempts: 2,
            bestScore: 88,
            lastScore: 72,
            followUp: 'Follow-up for 72',
        })
        expect(progress.scenarioProgress['first-meeting'].bestDimensions.completeness).toBe(88)
    })

    it('tracks unique extra words separately from the fixed daily route', async () => {
        const content = useContentStore()
        const progress = useProgressStore()
        const [firstWord, secondWord] = content.words.slice(-2)

        await progress.reviewWord(firstWord, 'good', { trackExtraWord: true })
        await progress.reviewWord(firstWord, 'hard', { trackExtraWord: true })
        await progress.reviewWord(secondWord, 'again', { trackExtraWord: true })

        expect(progress.todaySession.reviewed).toBe(3)
        expect(progress.todaySession.extraWordIds).toEqual([firstWord.id, secondWord.id])
        expect(progress.todayExtraWordCount).toBe(2)
        expect(progress.todayPlanCompletedCount).toBe(0)

        const backup = progress.exportProgress()
        setActivePinia(createPinia())
        const restored = useProgressStore()
        await restored.importProgress(backup)
        expect(restored.todayExtraWordCount).toBe(2)
    })

    it('round-trips the expanded progress model through a backup', async () => {
        const content = useContentStore()
        const source = useProgressStore()
        await source.reviewWord(content.words[0], 'again', { practiceMode: 'listening' })
        await source.recordScenarioAttempt('first-meeting', evaluation(91))
        const backup = source.exportProgress()

        setActivePinia(createPinia())
        const restored = useProgressStore()
        await restored.importProgress(backup)

        expect(restored.records[content.words[0].id].needsMistakeReview).toBe(true)
        expect(restored.practiceStats.listening.attempts).toBe(1)
        expect(restored.scenarioProgress['first-meeting'].bestScore).toBe(91)
    })
})

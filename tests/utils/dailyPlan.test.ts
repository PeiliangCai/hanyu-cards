import { describe, expect, it } from 'vitest'
import type {
    HskWord,
    WordProgress,
} from '@/types/learning'
import {
    buildDailyWordIds,
    dailyPlanKey,
    formatStudyTime,
    isDue,
    prioritizePracticeWords,
    todayKey,
} from '@/utils/learning'

const record: WordProgress = {
    wordId: 'test',
    reviews: 1,
    correct: 1,
    streak: 1,
    ease: 2.5,
    status: 'learning',
}

describe('learning/isDue', () => {
    it('does not count a new word as a scheduled review', () => {
        expect(isDue(undefined)).toBe(false)
    })

    it('keeps a reviewed legacy record without a schedule ready for review', () => {
        expect(isDue(record)).toBe(true)
    })

    it('counts only records whose scheduled time has arrived', () => {
        const now = new Date('2026-08-31T12:00:00.000Z')

        expect(isDue({ ...record, nextReviewAt: '2026-08-31T11:59:00.000Z' }, now)).toBe(true)
        expect(isDue({ ...record, nextReviewAt: '2026-08-31T12:01:00.000Z' }, now)).toBe(false)
    })
})

function word(id: string, frequency: number): HskWord {
    return {
        id,
        level: 1,
        simplified: id,
        traditional: id,
        pinyin: id,
        numericPinyin: id,
        english: id,
        partOfSpeech: [],
        radical: '',
        frequency,
        examples: [],
        tags: [],
    }
}

describe('learning/daily plan', () => {
    it('keeps the full practice course beyond both historical 400- and 500-word limits', () => {
        const words = Array.from({ length: 601 }, (_, index) => word(`word-${index}`, index))
        const ranked = prioritizePracticeWords(words, { 'word-600': { ...record, wordId: 'word-600', needsMistakeReview: true } })
        expect(ranked).toHaveLength(601)
        expect(ranked[0].id).toBe('word-600')
        expect(new Set(ranked.map((entry) => entry.id))).toEqual(new Set(words.map((entry) => entry.id)))
    })

    it('prioritises due reviews, mistakes, then fresh high-frequency words', () => {
        const now = new Date(2026, 7, 31, 12)
        const words = [word('fresh-low', 100), word('mistake', 50), word('due', 10), word('fresh-high', 1)]
        const records: Record<string, WordProgress> = {
            due: {
                ...record,
                wordId: 'due',
                nextReviewAt: new Date(2026, 7, 31, 11).toISOString(),
            },
            mistake: {
                ...record,
                wordId: 'mistake',
                nextReviewAt: new Date(2026, 8, 3, 11).toISOString(),
                needsMistakeReview: true,
                lastMistakeAt: new Date(2026, 7, 30, 11).toISOString(),
            },
        }

        expect(buildDailyWordIds(words, records, 4, now)).toEqual(['due', 'mistake', 'fresh-high', 'fresh-low'])
        expect(dailyPlanKey(todayKey(now))).toBe('2026-08-31:all')
    })

    it('does not put a word reviewed today back into a new queue', () => {
        const now = new Date(2026, 7, 31, 12)
        const reviewedToday = {
            ...record,
            wordId: 'today',
            lastReviewedAt: new Date(2026, 7, 31, 9).toISOString(),
        }

        expect(buildDailyWordIds([word('today', 1), word('fresh', 2)], { today: reviewedToday }, 2, now)).toEqual(['fresh'])
    })

    it('formats focused learning time compactly', () => {
        expect(formatStudyTime(42)).toBe('42s')
        expect(formatStudyTime(125)).toBe('2m')
        expect(formatStudyTime(3_900)).toBe('1h 5m')
    })
})

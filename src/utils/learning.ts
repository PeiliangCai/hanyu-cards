import type {
    HskLevel,
    HskWord,
    ReviewGrade,
    WordProgress,
} from '@/types/learning'
import { speakNativeMandarin } from '@/utils/native'

export const levelOptions: Array<{ label: string, value: HskLevel | 'all' }> = [
    { label: 'All HSK 1-3', value: 'all' },
    { label: 'HSK 1', value: 1 },
    { label: 'HSK 2', value: 2 },
    { label: 'HSK 3', value: 3 },
]

export const reviewLabels: Record<ReviewGrade, string> = {
    again: 'Again',
    hard: 'Hard',
    good: 'Good',
    easy: 'Easy',
}

export const reviewIntervalText: Record<ReviewGrade, string> = {
    again: '10 min',
    hard: '1 day',
    good: '3+ days',
    easy: '1+ week',
}

export function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeSearch(value: string) {
    return value.trim().toLocaleLowerCase()
}

export function isDue(progress?: WordProgress, now = new Date()) {
    if (!progress)
        return false
    if (!progress.nextReviewAt)
        return true

    return new Date(progress.nextReviewAt).getTime() <= now.getTime()
}

export function gradeToIntervalDays(grade: ReviewGrade, streak: number) {
    if (grade === 'again')
        return 10 / (24 * 60)
    if (grade === 'hard')
        return 1
    if (grade === 'good')
        return Math.min(30, 3 + streak * 2)

    return Math.min(60, 7 + streak * 5)
}

export function nextStatus(grade: ReviewGrade, reviews: number, streak: number): WordProgress['status'] {
    if (grade === 'again')
        return 'learning'
    if (streak >= 6 && reviews >= 8)
        return 'mastered'
    if (reviews >= 2)
        return 'reviewing'

    return 'learning'
}

export function formatDateTime(value?: string) {
    if (!value)
        return 'Ready now'

    const date = new Date(value)
    const diff = date.getTime() - Date.now()
    if (diff <= 0)
        return 'Ready now'
    if (diff < 60 * 60 * 1000)
        return `${Math.ceil(diff / 60000)} min`
    if (diff < 24 * 60 * 60 * 1000)
        return `${Math.ceil(diff / 3600000)} hr`

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export async function speakMandarin(text: string) {
    if (await speakNativeMandarin(text))
        return
    if (!('speechSynthesis' in window))
        return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.86
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
}

export function wordMatchesSearch(word: HskWord, term: string) {
    const query = normalizeSearch(term)
    if (!query)
        return true

    return [
        word.simplified,
        word.traditional,
        word.pinyin,
        word.numericPinyin,
        word.english,
        word.tags.join(' '),
    ].some((value) => normalizeSearch(value).includes(query))
}

export function chooseQuizOptions(current: HskWord, pool: HskWord[], display: (word: HskWord) => string = (word) => word.english) {
    const meaningKey = (word: HskWord) => display(word).trim().replace(/\s+/g, ' ').toLowerCase()
    const seen = new Set([meaningKey(current)])
    const candidates = pool.filter((word) => {
        const meaning = meaningKey(word)
        if (word.id === current.id || !meaning || seen.has(meaning))
            return false
        seen.add(meaning)

        return true
    })

    function shuffle(words: HskWord[]) {
        for (let index = words.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1))
            const previous = words[index]
            words[index] = words[swapIndex]
            words[swapIndex] = previous
        }

        return words
    }

    return shuffle([...shuffle(candidates).slice(0, 3), current])
}

export function dailyPlanKey(date: string) {
    return `${date}:all`
}

export function formatStudyTime(seconds: number) {
    const total = Math.max(0, Math.round(seconds))
    if (total < 60)
        return `${total}s`
    const minutes = Math.floor(total / 60)
    if (minutes < 60)
        return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60

    return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function buildDailyWordIds(words: HskWord[], records: Record<string, WordProgress>, goal: number, now = new Date()) {
    const date = todayKey(now)
    const available = words.filter((word) => {
        const lastReview = records[word.id]?.lastReviewedAt

        return !lastReview || todayKey(new Date(lastReview)) !== date
    })
    const due = available.filter((word) => isDue(records[word.id], now))
        .sort((left, right) => (records[left.id]?.nextReviewAt ?? '').localeCompare(records[right.id]?.nextReviewAt ?? ''))
    const dueIds = new Set(due.map((word) => word.id))
    const mistakes = available.filter((word) => records[word.id]?.needsMistakeReview && !dueIds.has(word.id))
        .sort((left, right) => (records[right.id]?.lastMistakeAt ?? '').localeCompare(records[left.id]?.lastMistakeAt ?? ''))
    const fresh = available.filter((word) => !records[word.id])
        .sort((left, right) => (left.frequency ?? Number.MAX_SAFE_INTEGER) - (right.frequency ?? Number.MAX_SAFE_INTEGER))

    return [...due, ...mistakes, ...fresh].slice(0, Math.max(0, Math.round(goal))).map((word) => word.id)
}

export function prioritizePracticeWords(words: HskWord[], records: Record<string, WordProgress>) {
    return [...words]
        .sort((left, right) => {
            const leftRecord = records[left.id]
            const rightRecord = records[right.id]
            const mistakeOrder = Number(Boolean(rightRecord?.needsMistakeReview)) - Number(Boolean(leftRecord?.needsMistakeReview))
            if (mistakeOrder)
                return mistakeOrder

            const leftAccuracy = leftRecord?.reviews ? leftRecord.correct / leftRecord.reviews : 0.5
            const rightAccuracy = rightRecord?.reviews ? rightRecord.correct / rightRecord.reviews : 0.5

            return leftAccuracy - rightAccuracy || (left.frequency ?? 99999) - (right.frequency ?? 99999)
        })

}

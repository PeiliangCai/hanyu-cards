<script setup lang="ts">
import {
    computed,
    nextTick,
    ref,
    watch,
} from 'vue'
import {
    ArrowForwardOutline,
    BookOutline,
    CheckmarkCircleOutline,
    FlameOutline,
    RefreshOutline,
    SparklesOutline,
    TimeOutline,
    TrophyOutline,
} from '@vicons/ionicons5'
import type {
    HskLevel,
    PracticeMode,
    WordProgress,
} from '@/types/learning'
import PaginationControls from '@/components/PaginationControls.vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import {
    dailyPlanKey,
    formatStudyTime,
    isDue,
    todayKey,
} from '@/utils/learning'
import { useReviewClock } from '@/composables/useReviewClock'

type StatusFilter = WordProgress['status'] | 'all' | 'mistakes'

const content = useContentStore()
const progress = useProgressStore()
const reviewClock = useReviewClock()
const selectedStatus = ref<StatusFilter>('all')
const selectedLevel = ref<HskLevel | 'all'>('all')
const wordPage = ref(1)
const wordPageSize = 20
const progressWordListElement = ref<HTMLElement>()
const statusFilters: Array<{ value: StatusFilter, label: string }> = [
    { value: 'all', label: 'Started' },
    { value: 'mistakes', label: 'Mistakes' },
    { value: 'learning', label: 'Learning' },
    { value: 'reviewing', label: 'Reviewing' },
    { value: 'mastered', label: 'Mastered' },
]
const practiceLabels: Record<PracticeMode, string> = {
    meaning: 'Meaning',
    hanzi: 'Hanzi recall',
    pinyin: 'Pinyin',
    listening: 'Listening',
    context: 'In context',
}

const dueCount = computed(() => content.words.filter((word) => isDue(progress.records[word.id], reviewClock.value)).length)
const completedScenarios = computed(() => content.scenarios.filter((scenario) => progress.completedScenarioIds.includes(scenario.id)).length)
const attemptedScenarios = computed(() => {
    return content.scenarios.filter((scenario) => {
        return Boolean(progress.scenarioProgress[scenario.id]) || progress.completedScenarioIds.includes(scenario.id)
    }).length
})
const totalXp = computed(() => progress.sessions.reduce((sum, session) => sum + session.xp, 0))
const todayPercent = computed(() => {
    return progress.todayPlanGoal
        ? Math.min(100, Math.round((progress.todayPlanCompletedCount / progress.todayPlanGoal) * 100))
        : 100
})
const currentStreak = computed(() => {
    let streak = 0
    const cursor = new Date()

    while (progress.sessions.some((session) => session.date === todayKey(cursor) && session.reviewed > 0)) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
    }

    return streak
})
const weeklyActivity = computed(() => {
    const days = []
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date()
        date.setDate(date.getDate() - offset)
        const dateKey = todayKey(date)
        const session = progress.sessions.find((item) => item.date === dateKey)
        const plan = progress.dailyPlans[dailyPlanKey(dateKey)]
        const completed = plan?.completedWordIds.length ?? 0
        const goal = plan?.goal ?? progress.dailyGoal
        const answers = session?.reviewed ?? 0
        days.push({
            date: dateKey,
            label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
            reviewed: completed,
            answers,
            accuracy: answers ? Math.round(((session?.correct ?? 0) / answers) * 100) : 0,
            studyTime: formatStudyTime(session?.studySeconds ?? 0),
            percent: goal ? Math.min(100, Math.round((completed / goal) * 100)) : 100,
        })
    }

    return days
})
const weeklyAnswers = computed(() => weeklyActivity.value.reduce((sum, day) => sum + day.answers, 0))
const weeklyCorrect = computed(() => {
    return progress.sessions
        .filter((session) => weeklyActivity.value.some((day) => day.date === session.date))
        .reduce((sum, session) => sum + session.correct, 0)
})
const weeklyAccuracy = computed(() => weeklyAnswers.value ? Math.round((weeklyCorrect.value / weeklyAnswers.value) * 100) : 0)
const nextStep = computed(() => {
    if (progress.activeMistakeCount > 0)
        return { to: '/mistakes', label: `Recover ${progress.activeMistakeCount} mistake${progress.activeMistakeCount === 1 ? '' : 's'}`, detail: 'Clear recent misses while the correction is still fresh.' }
    if (dueCount.value > 0)
        return { to: '/study', label: `Review ${Math.min(dueCount.value, progress.dailyGoal)} due words`, detail: 'Start with scheduled recall while the memory is ready.' }
    if (completedScenarios.value < content.scenarios.length)
        return { to: '/scenarios', label: 'Continue a real-life mission', detail: 'Apply familiar words in a useful conversation.' }

    return { to: '/practice', label: 'Test your recall', detail: 'Use adaptive practice to keep mastered words active.' }
})
const levelStats = computed(() => {
    return ([1, 2, 3] as const).map((level) => {
        const words = content.words.filter((word) => word.level === level)
        const reviewed = words.filter((word) => progress.records[word.id]?.reviews).length
        const mastered = words.filter((word) => progress.records[word.id]?.status === 'mastered').length

        return {
            level,
            total: words.length,
            reviewed,
            mastered,
            reviewedPercent: (reviewed / words.length) * 100,
        }
    })
})
const scopedStartedWords = computed(() => {
    return content.words.filter((word) => {
        return (selectedLevel.value === 'all' || word.level === selectedLevel.value)
            && Boolean(progress.records[word.id]?.reviews)
    })
})
const statusCounts = computed(() => {
    const records = scopedStartedWords.value.map((word) => progress.records[word.id])

    return {
        all: records.filter((record) => record.reviews > 0).length,
        mistakes: records.filter((record) => record.needsMistakeReview).length,
        new: records.filter((record) => record.status === 'new').length,
        learning: records.filter((record) => record.status === 'learning').length,
        reviewing: records.filter((record) => record.status === 'reviewing').length,
        mastered: records.filter((record) => record.status === 'mastered').length,
    }
})
const filteredDetailWords = computed(() => {
    return scopedStartedWords.value
        .filter((word) => {
            const record = progress.records[word.id]
            if (selectedStatus.value === 'all')
                return true
            if (selectedStatus.value === 'mistakes')
                return Boolean(record.needsMistakeReview)

            return record.status === selectedStatus.value
        })
        .sort((left, right) => {
            return (progress.records[right.id].lastReviewedAt ?? '').localeCompare(progress.records[left.id].lastReviewedAt ?? '')
        })
})
const detailWords = computed(() => {
    const start = (wordPage.value - 1) * wordPageSize

    return filteredDetailWords.value.slice(start, start + wordPageSize)
})
const practicePerformance = computed(() => {
    return (Object.keys(practiceLabels) as PracticeMode[]).map((mode) => {
        const stats = progress.practiceStats[mode]

        return {
            mode,
            label: practiceLabels[mode],
            attempts: stats.attempts,
            accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0,
        }
    })
})
const scenarioPerformance = computed(() => {
    return content.scenarios.map((scenario) => ({
        ...scenario,
        progress: progress.scenarioProgress[scenario.id],
    }))
})

function chooseLevel(level: HskLevel) {
    selectedLevel.value = selectedLevel.value === level ? 'all' : level
}

watch([selectedStatus, selectedLevel], () => {
    wordPage.value = 1
})
watch(filteredDetailWords, (words) => {
    wordPage.value = Math.min(wordPage.value, Math.max(1, Math.ceil(words.length / wordPageSize)))
})
watch(wordPage, async () => {
    await nextTick()
    if (progressWordListElement.value)
        progressWordListElement.value.scrollTop = 0
})
</script>

<template>
    <section class="screen progress-screen">
        <section class="progress-hero">
            <div class="progress-hero__copy">
                <p class="eyebrow">Your learning story</p>
                <h2>Small steps become<br />real Chinese.</h2>
                <p>See recall, practice skills, mission scores, and focused words in one place.</p>
                <div class="progress-hero__highlights">
                    <span><FlameOutline></FlameOutline><strong>{{ currentStreak }}</strong> day streak</span>
                    <span><TrophyOutline></TrophyOutline><strong>{{ totalXp }}</strong> total XP</span>
                    <span><TimeOutline></TimeOutline><strong>{{ formatStudyTime(progress.totalStudySeconds) }}</strong> focused</span>
                </div>
            </div>
            <div
                class="progress-orbit"
                :style="{ '--daily-progress': `${todayPercent * 3.6}deg` }">
                <div><strong>{{ todayPercent }}%</strong><span>daily route</span></div>
            </div>
        </section>

        <div class="stats-grid">
            <article><i><SparklesOutline></SparklesOutline></i><div><span>{{ progress.todayPlanCompletedCount }}/{{ progress.todayPlanGoal }}</span><p>daily cards complete</p></div></article>
            <article><i><BookOutline></BookOutline></i><div><span>{{ progress.todaySession.reviewed }}</span><p>answers today<span v-if="progress.todayExtraWordCount"> · {{ progress.todayExtraWordCount }} extra word{{ progress.todayExtraWordCount === 1 ? '' : 's' }}</span></p></div></article>
            <article><i><CheckmarkCircleOutline></CheckmarkCircleOutline></i><div><span>{{ progress.accuracy }}%</span><p>accuracy</p></div></article>
            <article><i><TrophyOutline></TrophyOutline></i><div><span>{{ progress.masteredCount }}</span><p>mastered</p></div></article>
            <article><i><TimeOutline></TimeOutline></i><div><span>{{ dueCount }}</span><p>due now</p></div></article>
            <article><i><RefreshOutline></RefreshOutline></i><div><span>{{ progress.activeMistakeCount }}</span><p>mistakes to recover</p></div></article>
        </div>

        <section class="next-step-band">
            <div><p class="eyebrow">Recommended next</p><h3>{{ nextStep.label }}</h3><span>{{ nextStep.detail }}</span></div>
            <RouterLink
                :to="nextStep.to"
                class="primary-action">Start<ArrowForwardOutline></ArrowForwardOutline></RouterLink>
        </section>

        <section class="analytics-section weekly-section">
            <header>
                <div><p class="eyebrow">Last seven days</p><h3>Learning rhythm</h3></div>
                <span class="section-note">{{ weeklyAnswers }} answers · {{ weeklyAccuracy }}% accuracy</span>
            </header>
            <div class="weekly-chart">
                <div
                    v-for="day in weeklyActivity"
                    :key="day.date"
                    :title="`${day.reviewed} daily cards · ${day.answers} answers · ${day.accuracy}% accuracy · ${day.studyTime}`">
                    <span>{{ day.reviewed }}</span><i><b :style="{ height: `${Math.max(4, day.percent)}%` }"></b></i><small>{{ day.label }}</small>
                    <em>{{ day.accuracy }}%</em>
                </div>
            </div>
        </section>

        <section class="analytics-section practice-analytics">
            <header>
                <div><p class="eyebrow">Adaptive practice</p><h3>Skill balance</h3></div>
                <RouterLink
                    to="/practice"
                    class="text-link">Practice now <ArrowForwardOutline></ArrowForwardOutline></RouterLink>
            </header>
            <div class="skill-performance-grid">
                <article
                    v-for="item in practicePerformance"
                    :key="item.mode">
                    <header><strong>{{ item.label }}</strong><span>{{ item.attempts ? `${item.accuracy}%` : 'New' }}</span></header>
                    <div class="progress-track"><i :style="{ width: `${item.accuracy}%` }"></i></div>
                    <small>{{ item.attempts }} answer{{ item.attempts === 1 ? '' : 's' }}</small>
                </article>
            </div>
        </section>

        <section class="analytics-section scenario-analytics">
            <header>
                <div><p class="eyebrow">Applied Chinese</p><h3>Scenario missions</h3></div>
                <strong>{{ attemptedScenarios }}/{{ content.scenarios.length }} explored · {{ completedScenarios }}/{{ content.scenarios.length }} complete</strong>
            </header>
            <div class="scenario-progress-pair">
                <div><span>Explored</span><div class="progress-track"><i :style="{ width: `${(attemptedScenarios / content.scenarios.length) * 100}%` }"></i></div></div>
                <div><span>Complete</span><div class="progress-track"><i :style="{ width: `${(completedScenarios / content.scenarios.length) * 100}%` }"></i></div></div>
            </div>
            <div class="scenario-score-grid">
                <article
                    v-for="scenario in scenarioPerformance"
                    :key="scenario.id">
                    <span>HSK {{ scenario.level }}</span>
                    <strong>{{ scenario.chineseTitle }}</strong>
                    <small v-if="progress.completedScenarioIds.includes(scenario.id)">Complete · {{ scenario.progress ? `Best ${scenario.progress.bestScore}/100` : 'No saved score' }}</small>
                    <small v-else-if="scenario.progress">Attempted · Best {{ scenario.progress.bestScore }}/100 · {{ scenario.progress.attempts }} attempt{{ scenario.progress.attempts === 1 ? '' : 's' }}</small>
                    <small v-else>Not attempted</small>
                </article>
            </div>
        </section>

        <section class="analytics-section vocabulary-analytics">
            <header>
                <div><p class="eyebrow">Vocabulary detail</p><h3>Explore your word progress</h3></div>
                <RouterLink
                    v-if="progress.activeMistakeCount"
                    to="/mistakes"
                    class="text-link">Open mistake notebook <ArrowForwardOutline></ArrowForwardOutline></RouterLink>
            </header>

            <div class="level-progress">
                <article
                    v-for="stat in levelStats"
                    :key="stat.level"
                    @click="chooseLevel(stat.level)"
                    @keydown.enter="chooseLevel(stat.level)"
                    @keydown.space.prevent="chooseLevel(stat.level)"
                    role="button"
                    tabindex="0"
                    :aria-pressed="selectedLevel === stat.level"
                    :class="{ selected: selectedLevel === stat.level }">
                    <header><strong>HSK {{ stat.level }}</strong><span>{{ stat.reviewed }}/{{ stat.total }} started</span></header>
                    <div
                        class="progress-track"
                        :aria-label="`HSK ${stat.level}: ${stat.reviewed} of ${stat.total} words started`">
                        <i
                            :class="{ 'has-progress': stat.reviewed > 0 }"
                            :style="{ width: `${stat.reviewedPercent}%` }"></i>
                    </div>
                    <p>{{ stat.mastered }} mastered through repeated successful reviews.</p>
                </article>
            </div>

            <div
                class="word-status-tabs"
                aria-label="Word status filter">
                <button
                    v-for="filter in statusFilters"
                    :key="filter.value"
                    @click="selectedStatus = filter.value"
                    :class="{ active: selectedStatus === filter.value }"
                    type="button">
                    {{ filter.label }} <span>{{ statusCounts[filter.value] }}</span>
                </button>
            </div>

            <div
                v-if="filteredDetailWords.length"
                class="progress-word-list-panel">
                <div
                    ref="progressWordListElement"
                    class="progress-word-list">
                    <RouterLink
                        v-for="word in detailWords"
                        :key="word.id"
                        @click="content.setActiveWord(word.id)"
                        to="/dictionary">
                        <span class="progress-word-list__hanzi">{{ word.simplified }}</span>
                        <span><strong>{{ word.pinyin }}</strong><small>{{ word.english }}</small></span>
                        <span class="progress-word-list__status">{{ progress.records[word.id].needsMistakeReview ? 'mistake' : progress.records[word.id].status }}</span>
                    </RouterLink>
                </div>
                <PaginationControls
                    v-model:page="wordPage"
                    :page-size="wordPageSize"
                    :total-items="filteredDetailWords.length"
                    label="Word progress pagination">
                </PaginationControls>
            </div>
            <div
                v-else
                class="analytics-empty"><BookOutline></BookOutline><span>No words match this view yet.</span></div>
        </section>
    </section>
</template>

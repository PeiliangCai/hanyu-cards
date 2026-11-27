<script setup lang="ts">
import {
    computed,
    onMounted,
    ref,
    watch,
} from 'vue'
import {
    ArrowForwardOutline,
    CheckmarkCircleOutline,
    FlagOutline,
    RefreshOutline,
    SparklesOutline,
} from '@vicons/ionicons5'
import { useRoute } from 'vue-router'
import type { ReviewGrade } from '@/types/learning'
import WordCard from '@/components/WordCard.vue'
import { useReviewClock } from '@/composables/useReviewClock'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import {
    buildDailyWordIds,
    dailyPlanKey,
    isDue,
    levelOptions,
    todayKey,
} from '@/utils/learning'

const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const route = useRoute()
const reviewClock = useReviewClock()
const reveal = ref(false)
const preparing = ref(true)
const focusedReviewed = ref(false)
const planDate = computed(() => todayKey(reviewClock.value))
const savingReview = ref(false)

const currentPlanKey = computed(() => dailyPlanKey(planDate.value))
const currentPlan = computed(() => progress.dailyPlans[currentPlanKey.value])
const planLevel = computed(() => currentPlan.value?.level ?? settings.dailyStudyLevel)
const studyWords = computed(() => {
    return content.words.filter((word) => planLevel.value === 'all' || word.level === planLevel.value)
})
const planLevelLabel = computed(() => {
    return levelOptions.find((option) => option.value === planLevel.value)?.label ?? 'All HSK 1-3'
})
const planWords = computed(() => {
    return currentPlan.value?.wordIds
        .map((id) => content.wordsById[id])
        .filter(Boolean) ?? []
})
const remainingWords = computed(() => {
    const completed = new Set(currentPlan.value?.completedWordIds ?? [])

    return planWords.value.filter((word) => !completed.has(word.id))
})
const dailyActiveWord = computed(() => remainingWords.value[0])
const focusedWordId = computed(() => typeof route.query.word === 'string' ? route.query.word : '')
const focusedWord = computed(() => content.words.find((word) => word.id === focusedWordId.value))
const isFocusedStudy = computed(() => Boolean(focusedWord.value))
const focusedWordInPlan = computed(() => {
    return Boolean(focusedWord.value && currentPlan.value?.wordIds.includes(focusedWord.value.id))
})
const displayedWord = computed(() => focusedWord.value ?? dailyActiveWord.value)
const completedCount = computed(() => currentPlan.value?.completedWordIds.length ?? 0)
const planGoal = computed(() => currentPlan.value?.goal ?? progress.dailyGoal)
const planPercent = computed(() => {
    return planGoal.value ? Math.min(100, Math.round((completedCount.value / planGoal.value) * 100)) : 100
})
const dueCount = computed(() => {
    return studyWords.value.filter((word) => isDue(progress.records[word.id], reviewClock.value)).length
})
const newCount = computed(() => studyWords.value.filter((word) => !progress.records[word.id]).length)
const answersToday = computed(() => progress.todaySession.reviewed)
const gradeSummary = computed(() => {
    const results = Object.values(currentPlan.value?.results ?? {})

    return {
        remembered: results.filter((grade) => grade !== 'again').length,
        needsWork: results.filter((grade) => grade === 'again').length,
        xp: results.reduce((sum, grade) => sum + ({ again: 1, hard: 3, good: 5, easy: 8 }[grade]), 0),
    }
})

async function preparePlan() {
    preparing.value = true
    await progress.hydrate()
    const existingPlan = progress.dailyPlans[currentPlanKey.value]
    const level = existingPlan?.level ?? settings.dailyStudyLevel
    const eligibleWords = content.words.filter((word) => level === 'all' || word.level === level)
    const ids = buildDailyWordIds(
        eligibleWords,
        progress.records,
        progress.dailyGoal,
        reviewClock.value,
    )
    await progress.ensureDailyPlan(currentPlanKey.value, planDate.value, level, ids)
    reveal.value = false
    preparing.value = false
}

async function review(grade: ReviewGrade) {
    if (!displayedWord.value || savingReview.value || focusedReviewed.value)
        return

    const word = displayedWord.value
    const focused = isFocusedStudy.value
    const focusId = focusedWordId.value
    const options = focused
        ? focusedWordInPlan.value ? { dailyPlanKey: currentPlanKey.value } : { trackExtraWord: true }
        : { dailyPlanKey: currentPlanKey.value }
    savingReview.value = true
    reveal.value = false
    try {
        await progress.reviewWord(word, grade, options)
        if (focused && focusedWordId.value === focusId)
            focusedReviewed.value = true
    }
    finally {
        savingReview.value = false
    }
}

function repeatFocusedWord() {
    focusedReviewed.value = false
    reveal.value = false
}

onMounted(preparePlan)
watch(planDate, preparePlan)
watch(displayedWord, (word) => {
    if (word)
        content.setActiveWord(word.id)
}, { immediate: true })
watch(focusedWordId, () => {
    focusedReviewed.value = false
    reveal.value = false
})
</script>

<template>
    <section class="screen study-screen">
        <section class="study-hero">
            <div class="study-hero__copy">
                <p class="eyebrow">Today · A plan you can finish</p>
                <h2>Build a little Mandarin<br />into every day.</h2>
                <p>Your queue is fixed for today, so every card brings you closer to a clear finish.</p>
                <div class="study-hero__actions">
                    <RouterLink
                        to="/mistakes"
                        class="secondary-action">
                        <RefreshOutline></RefreshOutline>
                        Mistake notebook · {{ progress.activeMistakeCount }}
                    </RouterLink>
                </div>
            </div>

            <div
                class="study-plan-ring"
                :style="{ '--plan-progress': `${planPercent * 3.6}deg` }">
                <div>
                    <strong>{{ completedCount }}/{{ planGoal }}</strong>
                    <span>{{ remainingWords.length ? 'today’s plan' : 'complete' }}</span>
                </div>
            </div>
        </section>

        <section
            class="deck-status"
            aria-label="Today learning status">
            <div>
                <strong>{{ dueCount }}</strong>
                <span>reviews due</span>
            </div>
            <div>
                <strong>{{ newCount }}</strong>
                <span>new words</span>
            </div>
            <div>
                <strong>{{ answersToday }}</strong>
                <span>answers today<small v-if="progress.todayExtraWordCount">+{{ progress.todayExtraWordCount }} extra word{{ progress.todayExtraWordCount === 1 ? '' : 's' }}</small></span>
            </div>
            <div class="deck-status__scope">
                <span><small>Today’s fixed set</small><strong>{{ planLevelLabel }}</strong></span>
                <RouterLink to="/settings">Change tomorrow</RouterLink>
            </div>
        </section>

        <section
            v-if="!preparing && currentPlan && !isFocusedStudy"
            class="daily-plan-strip">
            <div>
                <span>Daily route</span>
                <strong>{{ remainingWords.length ? `Card ${completedCount + 1} of ${planGoal}` : `${planGoal} of ${planGoal} complete` }}</strong>
            </div>
            <div class="progress-track"><i :style="{ width: `${planPercent}%` }"></i></div>
            <small>{{ completedCount ? 'Progress saved automatically — repeat practice will not increase this count.' : 'One rating completes today’s card; Again also sends it to your mistake notebook.' }}</small>
        </section>

        <section
            v-else-if="!preparing && focusedWord"
            class="focused-study-strip">
            <SparklesOutline></SparklesOutline>
            <div>
                <span>Selected from Words</span>
                <strong>{{ settings.showTraditional ? focusedWord.traditional : focusedWord.simplified }} · {{ focusedWord.pinyin }}</strong>
                <small>{{ focusedWordInPlan
                    ? 'This word is already in today’s route. Its first rating completes that assigned card; repeat ratings do not add more.'
                    : 'This focused review updates memory and records one extra word, but it does not change your fixed daily-card route.' }}</small>
            </div>
            <RouterLink
                :to="{ name: 'study' }"
                class="secondary-action">Return to Today</RouterLink>
        </section>

        <div
            v-if="preparing"
            class="study-empty">
            <SparklesOutline></SparklesOutline>
            <h3>Preparing today’s route…</h3>
        </div>

        <WordCard
            v-else-if="displayedWord && !focusedReviewed"
            :key="`${isFocusedStudy ? 'focus' : 'daily'}-${displayedWord.id}`"
            @reveal="reveal = true"
            @review="review"
            :word="displayedWord"
            :disabled="savingReview"
            :progress="progress.records[displayedWord.id]"
            :reveal="reveal"
            :tts-enabled="settings.ttsEnabled"
            :show-traditional="settings.showTraditional">
        </WordCard>

        <section
            v-else-if="focusedWord && focusedReviewed"
            class="study-complete-card focused-study-complete">
            <span class="study-complete-card__icon"><CheckmarkCircleOutline></CheckmarkCircleOutline></span>
            <p class="eyebrow">Focused review saved</p>
            <h3>{{ settings.showTraditional ? focusedWord.traditional : focusedWord.simplified }} · {{ focusedWord.pinyin }}</h3>
            <p v-if="focusedWordInPlan">Your memory record and answer statistics were updated. Because this word belongs to today’s assigned route, its first rating can complete that card. Daily progress is now {{ completedCount }}/{{ planGoal }}.</p>
            <p v-else>Your memory record and answer statistics were updated, and this is recorded as +1 extra word. Today’s fixed daily-card count remains {{ completedCount }}/{{ planGoal }}.</p>
            <div class="study-complete-card__actions">
                <button
                    @click="repeatFocusedWord"
                    type="button"
                    class="secondary-action">
                    <RefreshOutline></RefreshOutline>
                    Study again
                </button>
                <RouterLink
                    to="/dictionary"
                    class="secondary-action">Back to Words</RouterLink>
                <RouterLink
                    :to="{ name: 'study' }"
                    class="primary-action">
                    Continue Today
                    <ArrowForwardOutline></ArrowForwardOutline>
                </RouterLink>
            </div>
        </section>

        <section
            v-else
            class="study-complete-card">
            <span class="study-complete-card__icon"><CheckmarkCircleOutline></CheckmarkCircleOutline></span>
            <p class="eyebrow">Daily route complete</p>
            <h3>{{ planGoal ? '今天的学习计划完成了！' : 'No cards available in this set.' }}</h3>
            <p v-if="planGoal">You remembered {{ gradeSummary.remembered }} cards and earned {{ gradeSummary.xp }} XP. {{ gradeSummary.needsWork }} card{{ gradeSummary.needsWork === 1 ? '' : 's' }} moved into your mistake notebook.</p>
            <p v-else>Try another HSK level or return tomorrow for the next review.</p>
            <div
                v-if="planGoal"
                class="study-complete-card__stats">
                <span><strong>{{ gradeSummary.remembered }}</strong> recalled</span>
                <span><strong>{{ gradeSummary.needsWork }}</strong> to revisit</span>
                <span><strong>{{ gradeSummary.xp }}</strong> XP</span>
            </div>
            <details
                v-if="planWords.length"
                class="today-word-review">
                <summary>Review today’s {{ planWords.length }} words</summary>
                <p>These are the unique cards counted in {{ completedCount }}/{{ planGoal }}. Opening them again will not increase the daily route.</p>
                <div class="today-word-review__grid">
                    <RouterLink
                        v-for="word in planWords"
                        :key="word.id"
                        @click="content.setActiveWord(word.id)"
                        to="/dictionary">
                        <strong>{{ settings.showTraditional ? word.traditional : word.simplified }}</strong>
                        <span>{{ word.pinyin }}</span>
                        <small>{{ currentPlan?.results[word.id] ?? 'viewed' }}</small>
                    </RouterLink>
                </div>
            </details>
            <div class="study-complete-card__actions">
                <RouterLink
                    to="/mistakes"
                    class="secondary-action">
                    <FlagOutline></FlagOutline>
                    Review mistakes
                </RouterLink>
                <RouterLink
                    to="/practice"
                    class="primary-action">
                    Keep practicing
                    <ArrowForwardOutline></ArrowForwardOutline>
                </RouterLink>
            </div>
        </section>
    </section>
</template>

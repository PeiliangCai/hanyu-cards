<script setup lang="ts">
import {
    computed,
    onMounted,
    ref,
    watch,
} from 'vue'
import {
    CheckmarkCircleOutline,
    HeadsetOutline,
    RefreshOutline,
    SparklesOutline,
    TrophyOutline,
    VolumeHighOutline,
} from '@vicons/ionicons5'
import type {
    HskLevel,
    HskWord,
    PracticeMode,
} from '@/types/learning'
import { learningScenarios } from '@/data/scenarios'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import {
    chooseQuizOptions,
    levelOptions,
    prioritizePracticeWords,
    speakMandarin,
} from '@/utils/learning'

type PracticeSelection = PracticeMode | 'mixed'

interface ContextPrompt {
    line: string
    source: string
}

interface PracticeQuestion {
    mode: PracticeMode
    word: HskWord
    options: HskWord[]
    context?: ContextPrompt
}

const modeOptions: Array<{ value: PracticeSelection, label: string, detail: string }> = [
    { value: 'mixed', label: 'Adaptive mix', detail: 'Targets your weakest skills' },
    { value: 'meaning', label: 'Meaning', detail: 'Hanzi → meaning' },
    { value: 'hanzi', label: 'Hanzi recall', detail: 'Meaning → hanzi' },
    { value: 'pinyin', label: 'Pinyin', detail: 'Hanzi → pronunciation' },
    { value: 'listening', label: 'Listening', detail: 'Audio → meaning' },
    { value: 'context', label: 'In context', detail: 'Complete a dialogue' },
]
const practiceModes: PracticeMode[] = ['meaning', 'hanzi', 'pinyin', 'listening', 'context']
const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const selectedMode = ref<PracticeSelection>('mixed')
const practiceLevel = ref<HskLevel | 'all'>('all')
const question = ref<PracticeQuestion>()
const selectedId = ref('')
const answered = ref(false)
const savingAnswer = ref(false)
const score = ref(0)
const answerStreak = ref(0)
const sessionAnswered = ref(0)
const questionCursor = ref(0)
const preparing = ref(true)
const roundSummary = ref(false)
const roundResults = ref<Array<{ mode: PracticeMode, correct: boolean }>>([])
const sessionTarget = 10

const practiceWords = computed(() => {
    return content.words.filter((word) => practiceLevel.value === 'all' || word.level === practiceLevel.value)
})
const contextByWord = computed(() => {
    const result = new Map<string, ContextPrompt>()
    practiceWords.value.forEach((word) => {
        for (const scenario of learningScenarios) {
            const line = scenario.dialogue.find((item) => item.zh.includes(word.simplified))
            if (line) {
                result.set(word.id, {
                    line: line.zh.replaceAll(word.simplified, '____'),
                    source: scenario.chineseTitle,
                })
                break
            }
        }
    })

    return result
})
const prioritizedPool = computed(() => prioritizePracticeWords(practiceWords.value, progress.records))
const isCorrect = computed(() => selectedId.value === question.value?.word.id)
const sessionComplete = computed(() => sessionAnswered.value >= sessionTarget)
const sessionPercent = computed(() => Math.min(100, Math.round((sessionAnswered.value / sessionTarget) * 100)))
const roundAccuracy = computed(() => Math.round((score.value / sessionTarget) * 100))
const roundPerformance = computed(() => {
    return practiceModes
        .map((mode) => {
            const results = roundResults.value.filter((result) => result.mode === mode)

            return {
                mode,
                label: modeOptions.find((option) => option.value === mode)?.label ?? mode,
                attempts: results.length,
                correct: results.filter((result) => result.correct).length,
            }
        })
        .filter((item) => item.attempts > 0)
})
const currentModeLabel = computed(() => {
    return modeOptions.find((item) => item.value === question.value?.mode)?.label ?? 'Adaptive mix'
})
const optionTextForMode = (word: HskWord, mode?: PracticeMode) => {
    if (mode === 'hanzi' || mode === 'context')
        return settings.showTraditional ? word.traditional : word.simplified
    if (mode === 'pinyin')
        return word.pinyin

    return word.english
}
const optionText = (word: HskWord) => optionTextForMode(word, question.value?.mode)
const correctAnswerText = computed(() => question.value ? optionText(question.value.word) : '')

function modeAccuracy(mode: PracticeMode) {
    const stats = progress.practiceStats[mode]

    return stats.attempts ? stats.correct / stats.attempts : -1
}

function adaptiveMode() {
    const available = practiceModes.filter((mode) => (mode !== 'context' || contextByWord.value.size > 0) && (mode !== 'listening' || settings.ttsEnabled))
    const ordered = [...available].sort((left, right) => {
        return modeAccuracy(left) - modeAccuracy(right) || practiceModes.indexOf(left) - practiceModes.indexOf(right)
    })

    return ordered[0]
}

function createQuestion() {
    const mode = selectedMode.value === 'mixed' ? adaptiveMode() : selectedMode.value
    const eligible = mode === 'context'
        ? prioritizedPool.value.filter((word) => contextByWord.value.has(word.id))
        : prioritizedPool.value
    const word = eligible[questionCursor.value % Math.max(1, eligible.length)]
    if (!word) {
        question.value = undefined
        preparing.value = false

        return
    }

    question.value = {
        mode,
        word,
        options: chooseQuizOptions(word, eligible.length >= 4 ? eligible : prioritizedPool.value, (candidate) => optionTextForMode(candidate, mode)),
        context: mode === 'context' ? contextByWord.value.get(word.id) : undefined,
    }
    content.setActiveWord(word.id)
    selectedId.value = ''
    answered.value = false
    preparing.value = false
}

function select(wordId: string) {
    if (!answered.value)
        selectedId.value = wordId
}

async function submit() {
    if (!selectedId.value || !question.value || answered.value)
        return

    answered.value = true
    sessionAnswered.value += 1
    if (isCorrect.value) {
        score.value += 1
        answerStreak.value += 1
    }
    else {
        answerStreak.value = 0
    }
    roundResults.value.push({ mode: question.value.mode, correct: isCorrect.value })
    savingAnswer.value = true
    try {
        await progress.reviewWord(question.value.word, isCorrect.value ? 'good' : 'again', {
            practiceMode: question.value.mode,
        })
    }
    finally {
        savingAnswer.value = false
    }
}

function next() {
    if (savingAnswer.value)
        return
    questionCursor.value += 1
    createQuestion()
}

function showRoundSummary() {
    if (savingAnswer.value)
        return
    roundSummary.value = true
}

function restart() {
    if (savingAnswer.value)
        return
    questionCursor.value += 1
    selectedId.value = ''
    answered.value = false
    score.value = 0
    answerStreak.value = 0
    sessionAnswered.value = 0
    roundSummary.value = false
    roundResults.value = []
    createQuestion()
}

function playPrompt() {
    if (question.value && settings.ttsEnabled)
        speakMandarin(question.value.word.simplified)
}

watch([practiceLevel, selectedMode], restart)
onMounted(async () => {
    await progress.hydrate()
    createQuestion()
})
</script>

<template>
    <section class="screen practice-screen">
        <section class="practice-hero">
            <div>
                <p class="eyebrow">Adaptive recall · 10 questions</p>
                <h2>Train every side<br />of your memory.</h2>
                <p>Meaning, characters, pronunciation, listening, and real dialogue adapt to your results.</p>
            </div>
            <div class="practice-score">
                <TrophyOutline></TrophyOutline>
                <span>
                    <strong>{{ score }}/{{ sessionAnswered || 0 }}</strong>
                    <small>correct this round</small>
                </span>
            </div>
        </section>

        <section
            class="practice-mode-picker"
            aria-label="Practice modes">
            <button
                v-for="mode in modeOptions"
                :key="mode.value"
                @click="selectedMode = mode.value"
                :disabled="savingAnswer || (mode.value === 'listening' && !settings.ttsEnabled)"
                :class="{ active: selectedMode === mode.value }"
                type="button">
                <SparklesOutline v-if="mode.value === 'mixed'"></SparklesOutline>
                <HeadsetOutline v-else-if="mode.value === 'listening'"></HeadsetOutline>
                <span><strong>{{ mode.label }}</strong><small>{{ mode.detail }}</small></span>
            </button>
        </section>

        <div class="practice-toolbar">
            <div>
                <span>Question {{ Math.min(sessionAnswered + (answered ? 0 : 1), sessionTarget) }} of {{ sessionTarget }} · {{ currentModeLabel }}</span>
                <div class="progress-track"><i :style="{ width: `${sessionPercent}%` }"></i></div>
            </div>
            <select
                v-model="practiceLevel"
                :disabled="savingAnswer"
                aria-label="Choose HSK level">
                <option
                    v-for="option in levelOptions"
                    :key="option.value"
                    :value="option.value">
                    {{ option.label }}
                </option>
            </select>
        </div>

        <div
            v-if="preparing"
            class="study-empty"><SparklesOutline></SparklesOutline><h3>Preparing adaptive practice…</h3></div>

        <section
            v-else-if="roundSummary"
            class="practice-round-summary">
            <span class="practice-round-summary__icon"><TrophyOutline></TrophyOutline></span>
            <p class="eyebrow">Round complete</p>
            <h3>{{ score }}/{{ sessionTarget }} correct · {{ roundAccuracy }}%</h3>
            <p>You completed ten practice questions. These answers count toward skill statistics, not the separate daily-card route.</p>
            <div class="practice-round-summary__modes">
                <span
                    v-for="item in roundPerformance"
                    :key="item.mode">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.correct }}/{{ item.attempts }}</small>
                </span>
            </div>
            <div class="practice-round-summary__actions">
                <button
                    @click="restart"
                    class="primary-action"
                    type="button">
                    <RefreshOutline></RefreshOutline>
                    Start another 10-question round
                </button>
                <RouterLink
                    to="/study"
                    class="secondary-action">Return to Today</RouterLink>
            </div>
        </section>

        <article
            v-else-if="question"
            class="quiz-panel"
            :class="`quiz-panel--${question.mode}`">
            <div class="quiz-panel__prompt">
                <span class="character-grid"></span>
                <button
                    v-if="question.mode === 'listening'"
                    @click="playPrompt"
                    class="quiz-panel__audio quiz-panel__audio--large"
                    type="button"
                    aria-label="Play listening prompt"
                    :disabled="!settings.ttsEnabled">
                    <VolumeHighOutline></VolumeHighOutline>
                </button>
                <template v-if="question.mode === 'meaning'">
                    <div class="quiz-panel__hanzi">{{ settings.showTraditional ? question.word.traditional : question.word.simplified }}</div>
                    <div class="quiz-panel__pinyin">{{ question.word.pinyin }}</div>
                    <small>Choose the closest meaning</small>
                </template>
                <template v-else-if="question.mode === 'hanzi'">
                    <div class="quiz-panel__meaning-prompt">{{ question.word.english }}</div>
                    <div class="quiz-panel__pinyin">{{ question.word.pinyin }}</div>
                    <small>Choose the matching Chinese word</small>
                </template>
                <template v-else-if="question.mode === 'pinyin'">
                    <div class="quiz-panel__hanzi">{{ settings.showTraditional ? question.word.traditional : question.word.simplified }}</div>
                    <div class="quiz-panel__meaning-caption">{{ question.word.english }}</div>
                    <small>Choose the correct pronunciation</small>
                </template>
                <template v-else-if="question.mode === 'listening'">
                    <div class="quiz-panel__listening-title">Listen, then choose</div>
                    <small>You can replay the Mandarin audio</small>
                </template>
                <template v-else>
                    <div class="quiz-panel__context">{{ question.context?.line }}</div>
                    <div class="quiz-panel__meaning-caption">From mission · {{ question.context?.source }}</div>
                    <small>Choose the word that completes the dialogue</small>
                </template>
            </div>

            <div class="quiz-options">
                <button
                    v-for="option in question.options"
                    :key="option.id"
                    @click="select(option.id)"
                    type="button"
                    :class="{
                        selected: selectedId === option.id,
                        correct: answered && option.id === question.word.id,
                        wrong: answered && selectedId === option.id && selectedId !== question.word.id,
                    }">
                    <span>{{ optionText(option) }}</span>
                    <CheckmarkCircleOutline v-if="answered && option.id === question.word.id"></CheckmarkCircleOutline>
                </button>
            </div>

            <div
                v-if="answered"
                class="quiz-feedback"
                :class="{ good: isCorrect }">
                <CheckmarkCircleOutline v-if="isCorrect"></CheckmarkCircleOutline>
                <span>
                    <strong>{{ isCorrect ? 'Correct — nicely remembered.' : 'Not quite. This word is now in your mistake notebook.' }}</strong>
                    <small>{{ isCorrect ? `${answerStreak} answer streak` : `The answer is “${correctAnswerText}”.` }}</small>
                </span>
            </div>

            <button
                v-if="!answered"
                @click="submit"
                class="primary-action"
                type="button"
                :disabled="!selectedId">
                Check Answer
            </button>
            <button
                v-else-if="!sessionComplete"
                @click="next"
                class="primary-action"
                :disabled="savingAnswer"
                type="button">
                {{ savingAnswer ? 'Saving answer…' : 'Next Question' }}
            </button>
            <button
                v-else
                @click="showRoundSummary"
                class="primary-action"
                :disabled="savingAnswer"
                type="button">
                View round summary
            </button>
        </article>

        <section
            v-else
            class="mistakes-empty">
            <h3>No practice words in this set.</h3>
            <p>Choose another HSK level to continue.</p>
        </section>
    </section>
</template>

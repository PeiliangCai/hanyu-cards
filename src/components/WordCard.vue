<script setup lang="ts">
import { computed } from 'vue'
import { EyeOutline, VolumeHighOutline } from '@vicons/ionicons5'
import type {
    HskWord,
    ReviewGrade,
    WordProgress,
} from '@/types/learning'
import { learningScenarios } from '@/data/scenarios'
import {
    formatDateTime,
    reviewIntervalText,
    reviewLabels,
    speakMandarin,
} from '@/utils/learning'
import { reviewHaptic } from '@/utils/native'

const props = defineProps<{
    word: HskWord
    progress?: WordProgress
    disabled?: boolean
    reveal: boolean
    ttsEnabled: boolean
    showTraditional: boolean
}>()

const emit = defineEmits<{
    review: [grade: ReviewGrade]
    reveal: []
}>()

const scenarioExample = computed(() => {
    const target = props.word.simplified
    for (const scenario of learningScenarios) {
        const vocabulary = scenario.vocabulary.find((item) => item.simplified === target)
        if (vocabulary) {
            const line = scenario.dialogue.find((item) => item.zh.includes(target))

            return { scenario, vocabulary, line }
        }
    }

    return undefined
})

function playAudio() {
    if (props.ttsEnabled)
        void speakMandarin(props.word.simplified)
}

function submitReview(grade: ReviewGrade) {
    if (props.disabled || !props.reveal)
        return
    void reviewHaptic(grade)
    emit('review', grade)
}
</script>

<template>
    <article
        class="word-card"
        aria-live="polite">
        <header class="word-card__header">
            <div class="word-card__meta">
                <span class="level-chip">HSK {{ word.level }}</span>
                <span>{{ progress?.status ?? 'new' }}</span>
                <span>{{ formatDateTime(progress?.nextReviewAt) }}</span>
            </div>

            <button
                @click="playAudio"
                class="word-card__audio"
                type="button"
                :disabled="!ttsEnabled"
                aria-label="Play pronunciation">
                <VolumeHighOutline></VolumeHighOutline>
                <span>Listen</span>
            </button>
        </header>

        <div class="word-card__face">
            <span
                class="character-grid"
                aria-hidden="true"></span>
            <div class="word-card__hanzi">{{ showTraditional ? word.traditional : word.simplified }}</div>
            <div class="word-card__pinyin">{{ word.pinyin }}</div>
            <small>Say it once before revealing the meaning</small>
        </div>

        <div class="word-card__reveal">
            <button
                v-if="!reveal"
                @click="emit('reveal')"
                class="primary-action"
                type="button">
                <EyeOutline></EyeOutline>
                Reveal meaning
            </button>

            <Transition name="answer-rise">
                <section
                    v-if="reveal"
                    class="word-card__answer">
                    <div class="word-card__meaning">
                        <small>Meaning</small>
                        <p>{{ word.english }}</p>
                    </div>
                    <div
                        v-if="scenarioExample"
                        class="word-card__context">
                        <small>From mission · {{ scenarioExample.scenario.chineseTitle }}</small>
                        <strong v-if="scenarioExample.line">{{ scenarioExample.line.zh }}</strong>
                        <span v-if="scenarioExample.line">{{ scenarioExample.line.pinyin }}</span>
                        <em>{{ scenarioExample.vocabulary.usage }}</em>
                    </div>
                    <div class="word-card__details">
                        <div class="word-card__tags">
                            <span
                                v-for="tag in word.tags.slice(0, 4)"
                                :key="tag">{{ tag }}</span>
                        </div>
                        <p
                            v-if="word.radical"
                            class="word-card__hint">Radical · {{ word.radical }}</p>
                    </div>
                </section>
            </Transition>
        </div>

        <footer class="word-card__review">
            <div>
                <strong>How well did you remember?</strong>
                <span>Honest answers make the next review smarter.</span>
            </div>
            <div
                class="review-grid"
                :class="{ 'review-grid--hidden': !reveal }">
                <button
                    v-for="grade in (['again', 'hard', 'good', 'easy'] as ReviewGrade[])"
                    :key="grade"
                    @click="submitReview(grade)"
                    type="button"
                    :class="['review-button', `review-button--${grade}`]"
                    :disabled="!reveal || disabled">
                    <span>{{ reviewLabels[grade] }}</span>
                    <small>{{ reviewIntervalText[grade] }}</small>
                </button>
            </div>
        </footer>
    </article>
</template>

<script setup lang="ts">
import {
    computed,
    ref,
    watch,
} from 'vue'
import type { HskWord, ReviewGrade } from '@/types/learning'
import WordCard from '@/components/WordCard.vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { isDue, levelOptions } from '@/utils/learning'

const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const reveal = ref(false)
const cursor = ref(0)
const savingReview = ref(false)

const studyQueue = computed(() => {
    const words = content.filteredWords
    const due = words.filter((word) => isDue(progress.records[word.id]))
    const fresh = words.filter((word) => !progress.records[word.id])
    const reviewing = due.filter((word) => progress.records[word.id])

    return [...reviewing, ...fresh].slice(0, 80)
})

const activeWord = computed<HskWord | undefined>(() => studyQueue.value[cursor.value] ?? studyQueue.value[0])

watch(activeWord, (word) => {
    if (word)
        content.setActiveWord(word.id)
}, { immediate: true })

watch(() => content.selectedLevel, () => {
    cursor.value = 0
    reveal.value = false
})

async function review(grade: ReviewGrade) {
    if (!activeWord.value || savingReview.value)
        return

    const reviewedWord = activeWord.value
    savingReview.value = true
    reveal.value = false
    try {
        await progress.reviewWord(reviewedWord, grade)
        cursor.value = studyQueue.value.length <= 1 ? 0 : Math.min(cursor.value, studyQueue.value.length - 1)
    }
    finally {
        savingReview.value = false
    }
}
</script>

<template>
    <section class="screen study-screen">
        <div class="screen__intro">
            <div>
                <p class="eyebrow">Smart review</p>
                <h2>Learn today's Mandarin words</h2>
            </div>
            <select
                v-model="content.selectedLevel"
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
            class="study-visual"
            aria-hidden="true">
            <span>汉</span>
            <span>语</span>
            <span>学</span>
            <span>习</span>
        </div>

        <WordCard
            v-if="activeWord"
            @reveal="reveal = true"
            @review="review"
            :word="activeWord"
            :progress="progress.records[activeWord.id]"
            :reveal="reveal"
            :tts-enabled="settings.ttsEnabled"
            :show-traditional="settings.showTraditional">
        </WordCard>

        <div
            v-else
            class="empty-state">
            <h3>No cards found</h3>
            <p>Try another HSK level or clear your search.</p>
        </div>
    </section>
</template>

<script setup lang="ts">
import {
    computed,
    onMounted,
    ref,
    watch,
} from 'vue'
import {
    ArrowBackOutline,
    CheckmarkCircleOutline,
    RefreshOutline,
    TrashOutline,
} from '@vicons/ionicons5'
import type { ReviewGrade } from '@/types/learning'
import WordCard from '@/components/WordCard.vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const reveal = ref(false)
const busy = ref(false)
onMounted(() => { void progress.hydrate() })
const reviewedThisVisit = ref(0)

const mistakeWords = computed(() => {
    return content.words
        .filter((word) => progress.records[word.id]?.needsMistakeReview)
        .sort((left, right) => {
            const leftRecord = progress.records[left.id]
            const rightRecord = progress.records[right.id]
            const dateOrder = (rightRecord.lastMistakeAt ?? '').localeCompare(leftRecord.lastMistakeAt ?? '')

            return dateOrder || (rightRecord.mistakeCount ?? 0) - (leftRecord.mistakeCount ?? 0)
        })
})
const activeWord = computed(() => mistakeWords.value[0])
const activeRecord = computed(() => activeWord.value ? progress.records[activeWord.value.id] : undefined)

async function review(grade: ReviewGrade) {
    if (!activeWord.value || busy.value)
        return
    const word = activeWord.value
    busy.value = true
    reveal.value = false
    try {
        await progress.reviewWord(word, grade, { resolveMistake: true })
        reviewedThisVisit.value += 1
    }
    finally { busy.value = false }
}

async function removeActive() {
    if (!activeWord.value || busy.value)
        return
    busy.value = true
    reveal.value = false
    try { await progress.resolveMistake(activeWord.value.id) }
    finally { busy.value = false }
}

watch(activeWord, (word) => {
    reveal.value = false
    if (word)
        content.setActiveWord(word.id)
}, { immediate: true })
</script>

<template>
    <section class="screen mistakes-screen">
        <section class="mistakes-hero">
            <div>
                <RouterLink
                    to="/study"
                    class="text-link"><ArrowBackOutline></ArrowBackOutline> Back to Today</RouterLink>
                <p class="eyebrow">Mistake notebook · Focused recovery</p>
                <h2>Turn every miss<br />into a stronger memory.</h2>
                <p>Words enter here after an incorrect answer. Recall one successfully to clear it from the notebook.</p>
            </div>
            <div class="mistakes-hero__count">
                <RefreshOutline></RefreshOutline>
                <span><strong>{{ mistakeWords.length }}</strong><small>words to revisit</small></span>
            </div>
        </section>

        <section
            v-if="activeWord && activeRecord"
            class="mistake-focus">
            <header>
                <div>
                    <p class="eyebrow">Recovery card {{ reviewedThisVisit + 1 }}</p>
                    <h3>{{ activeRecord.mistakeCount ?? 1 }} miss{{ (activeRecord.mistakeCount ?? 1) === 1 ? '' : 'es' }} recorded</h3>
                </div>
                <button
                    @click="removeActive"
                    :disabled="busy"
                    class="quiet-action"
                    type="button">
                    <TrashOutline></TrashOutline>
                    Remove from notebook
                </button>
            </header>
            <p class="mistake-focus__tip">Choose Good or Easy after recalling it to clear this word. Again or Hard keeps it in your focused queue.</p>
            <WordCard
                :key="activeWord.id"
                @reveal="reveal = true"
                @review="review"
                :word="activeWord"
                :disabled="busy"
                :progress="activeRecord"
                :reveal="reveal"
                :tts-enabled="settings.ttsEnabled"
                :show-traditional="settings.showTraditional">
            </WordCard>
        </section>

        <section
            v-else
            class="mistakes-empty">
            <CheckmarkCircleOutline></CheckmarkCircleOutline>
            <p class="eyebrow">Notebook clear</p>
            <h3>No mistakes waiting for review.</h3>
            <p>Incorrect practice answers will appear here automatically. For now, continue your daily route.</p>
            <RouterLink
                to="/study"
                class="primary-action">Return to Today</RouterLink>
        </section>
    </section>
</template>

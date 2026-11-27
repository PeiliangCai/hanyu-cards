<script setup lang="ts">
import {
    computed,
    ref,
    watch,
} from 'vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import {
    chooseQuizOptions,
    levelOptions,
    speakMandarin,
} from '@/utils/learning'

const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const currentIndex = ref(0)
const selectedId = ref('')
const answered = ref(false)

const pool = computed(() => content.filteredWords)
const current = computed(() => pool.value[currentIndex.value % Math.max(1, pool.value.length)])
const options = computed(() => current.value ? chooseQuizOptions(current.value, pool.value) : [])
const isCorrect = computed(() => selectedId.value === current.value?.id)

watch(current, (word) => {
    if (word)
        content.setActiveWord(word.id)
}, { immediate: true })

watch(pool, () => {
    currentIndex.value = 0
    selectedId.value = ''
    answered.value = false
})

function select(wordId: string) {
    if (answered.value)
        return
    selectedId.value = wordId
}

async function submit() {
    if (answered.value || !selectedId.value || !current.value)
        return

    answered.value = true
    await progress.reviewWord(current.value, isCorrect.value ? 'good' : 'again')
}

function next() {
    selectedId.value = ''
    answered.value = false
    currentIndex.value += 1
}
</script>

<template>
    <section class="screen practice-screen">
        <div class="screen__intro">
            <div>
                <p class="eyebrow">Multiple choice</p>
                <h2>Match the meaning</h2>
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

        <article
            v-if="current"
            class="quiz-panel">
            <button
                @click="speakMandarin(current.simplified)"
                :disabled="!settings.ttsEnabled"
                class="quiz-panel__audio"
                type="button">
                Hear word
            </button>
            <div class="quiz-panel__hanzi">{{ current.simplified }}</div>
            <div class="quiz-panel__pinyin">{{ current.pinyin }}</div>

            <div class="quiz-options">
                <button
                    v-for="option in options"
                    :key="option.id"
                    @click="select(option.id)"
                    type="button"
                    :class="{
                        selected: selectedId === option.id,
                        correct: answered && option.id === current.id,
                        wrong: answered && selectedId === option.id && selectedId !== current.id,
                    }">
                    {{ option.english }}
                </button>
            </div>

            <p
                v-if="answered"
                class="quiz-feedback"
                :class="{ good: isCorrect }">
                {{ isCorrect ? 'Correct. Nice recall.' : `Answer: ${current.english}` }}
            </p>

            <button
                v-if="!answered"
                @click="submit"
                class="primary-action"
                type="button"
                :disabled="!selectedId">
                Check Answer
            </button>
            <button
                v-else
                @click="next"
                class="primary-action"
                type="button">
                Next Question
            </button>
        </article>
    </section>
</template>

<script setup lang="ts">
import {
    CheckmarkCircleOutline,
    SparklesOutline,
    VolumeHighOutline,
} from '@vicons/ionicons5'
import {
    computed,
    ref,
    watch,
} from 'vue'
import { useAssistantStore } from '@/stores/assistant'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { speakMandarin } from '@/utils/learning'

const assistant = useAssistantStore()
const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const response = ref('')
const submitted = ref(false)

const activeScenario = computed(() => content.activeScenario)
const completedCount = computed(() => progress.completedScenarioIds.length)
const matchedKeywords = computed(() => {
    if (!activeScenario.value)
        return []

    const normalized = response.value.replace(/[\s，。！？、,.!?]/g, '')

    return activeScenario.value.task.expectedKeywords.filter((keyword) => normalized.includes(keyword))
})
const taskFeedback = computed(() => {
    const task = activeScenario.value?.task
    if (!task)
        return ''
    if (matchedKeywords.value.length === task.expectedKeywords.length)
        return 'Mission complete. You included every target expression. This keyword check does not assess grammar or fluency.'
    if (matchedKeywords.value.length)
        return `Good start. Add: ${task.expectedKeywords.filter((keyword) => !matchedKeywords.value.includes(keyword)).join(' · ')}`

    return `Try one of the target patterns: ${task.expectedKeywords.join(' · ')}`
})

watch(() => activeScenario.value?.id, () => {
    response.value = ''
    submitted.value = false
})

watch(response, () => { submitted.value = false })

function chooseScenario(scenarioId: string) {
    content.setActiveScenario(scenarioId)
    document.querySelector('.scenario-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function submitTask() {
    if (!response.value.trim() || !activeScenario.value)
        return

    submitted.value = true
    if (matchedKeywords.value.length === activeScenario.value.task.expectedKeywords.length)
        await progress.completeScenario(activeScenario.value.id)
}

function openTutor() {
    assistant.open()
}
</script>

<template>
    <section class="screen scenarios-screen">
        <div class="screen__intro">
            <div>
                <p class="eyebrow">Task-based learning</p>
                <h2>Real-life missions</h2>
                <p class="screen__description">Move from useful words to a complete conversation, then apply it yourself.</p>
            </div>
            <div
                class="scenario-summary"
                aria-label="Scenario course progress">
                <strong>{{ completedCount }}/{{ content.scenarios.length }}</strong>
                <span>missions complete</span>
            </div>
        </div>

        <div class="scenario-workspace">
            <aside
                class="scenario-list"
                aria-label="Scenario missions">
                <button
                    v-for="(scenario, index) in content.scenarios"
                    :key="scenario.id"
                    @click="chooseScenario(scenario.id)"
                    type="button"
                    class="scenario-tab"
                    :class="{ active: activeScenario?.id === scenario.id }"
                    :aria-current="activeScenario?.id === scenario.id ? 'step' : undefined">
                    <span class="scenario-tab__index">{{ String(index + 1).padStart(2, '0') }}</span>
                    <span>
                        <strong>{{ scenario.title }}</strong>
                        <small>HSK {{ scenario.level }} · {{ scenario.durationMinutes }} min</small>
                    </span>
                    <CheckmarkCircleOutline
                        v-if="progress.completedScenarioIds.includes(scenario.id)"
                        class="scenario-tab__complete"
                        aria-label="Complete">
                    </CheckmarkCircleOutline>
                </button>
            </aside>

            <article
                v-if="activeScenario"
                class="scenario-detail">
                <header class="scenario-hero">
                    <div>
                        <p class="eyebrow">HSK {{ activeScenario.level }} · {{ activeScenario.setting }}</p>
                        <h3>{{ activeScenario.chineseTitle }}</h3>
                        <span>{{ activeScenario.title }}</span>
                    </div>
                    <button
                        v-if="settings.assistantEnabled"
                        @click="openTutor"
                        type="button"
                        class="secondary-action">
                        <SparklesOutline></SparklesOutline>
                        AI role-play
                    </button>
                    <p>{{ activeScenario.mission }}</p>
                </header>

                <section class="lesson-section mission-objectives">
                    <div class="lesson-heading">
                        <span>01</span>
                        <div>
                            <p class="eyebrow">Mission skills</p>
                            <h3>What you will do</h3>
                        </div>
                    </div>
                    <ul>
                        <li
                            v-for="objective in activeScenario.objectives"
                            :key="objective">
                            {{ objective }}
                        </li>
                    </ul>
                </section>

                <section class="lesson-section">
                    <div class="lesson-heading">
                        <span>02</span>
                        <div>
                            <p class="eyebrow">Core expressions</p>
                            <h3>Build your toolkit</h3>
                        </div>
                    </div>
                    <div class="scenario-vocabulary">
                        <article
                            v-for="word in activeScenario.vocabulary"
                            :key="word.simplified">
                            <header>
                                <strong>{{ word.simplified }}</strong>
                                <button
                                    @click="speakMandarin(word.simplified)"
                                    :disabled="!settings.ttsEnabled"
                                    type="button"
                                    :aria-label="`Play ${word.simplified}`">
                                    <VolumeHighOutline></VolumeHighOutline>
                                </button>
                            </header>
                            <span>{{ word.pinyin }} · {{ word.english }}</span>
                            <p>{{ word.usage }}</p>
                        </article>
                    </div>
                </section>

                <section class="lesson-section">
                    <div class="lesson-heading">
                        <span>03</span>
                        <div>
                            <p class="eyebrow">Model dialogue</p>
                            <h3>Hear it in context</h3>
                        </div>
                    </div>
                    <div class="scenario-dialogue">
                        <div
                            v-for="(line, index) in activeScenario.dialogue"
                            :key="`${line.speaker}-${index}`"
                            class="dialogue-line">
                            <span>{{ line.speaker }}</span>
                            <div>
                                <strong>{{ line.zh }}</strong>
                                <small>{{ line.pinyin }}</small>
                                <p>{{ line.en }}</p>
                            </div>
                            <button
                                @click="speakMandarin(line.zh)"
                                :disabled="!settings.ttsEnabled"
                                type="button"
                                :aria-label="`Play line ${index + 1}`">
                                <VolumeHighOutline></VolumeHighOutline>
                            </button>
                        </div>
                    </div>
                </section>

                <aside class="culture-band">
                    <span>Culture in context</span>
                    <div>
                        <h3>{{ activeScenario.cultureTitle }}</h3>
                        <p>{{ activeScenario.cultureNote }}</p>
                    </div>
                </aside>

                <section class="scenario-task">
                    <div class="lesson-heading">
                        <span>04</span>
                        <div>
                            <p class="eyebrow">Your turn</p>
                            <h3>Complete the mission</h3>
                        </div>
                    </div>
                    <p>{{ activeScenario.task.prompt }}</p>
                    <label :for="`scenario-response-${activeScenario.id}`">Your response in Chinese</label>
                    <textarea
                        :id="`scenario-response-${activeScenario.id}`"
                        v-model="response"
                        rows="4"
                        :placeholder="activeScenario.task.hint">
                    </textarea>
                    <button
                        @click="submitTask"
                        class="primary-action"
                        type="button"
                        :disabled="!response.trim()">
                        Check response
                    </button>

                    <div
                        v-if="submitted"
                        class="task-feedback"
                        aria-live="polite">
                        <strong>{{ taskFeedback }}</strong>
                        <p>Model response</p>
                        <span>{{ activeScenario.task.modelAnswer.zh }}</span>
                        <small>{{ activeScenario.task.modelAnswer.pinyin }}</small>
                        <small>{{ activeScenario.task.modelAnswer.en }}</small>
                    </div>
                </section>
            </article>
        </div>
    </section>
</template>

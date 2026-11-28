<script setup lang="ts">
import {
    computed,
    nextTick,
    ref,
    watch,
} from 'vue'
import {
    ChatbubbleEllipsesOutline,
    CloseOutline,
    SendOutline,
    SparklesOutline,
} from '@vicons/ionicons5'
import { useAssistantStore } from '@/stores/assistant'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { isDue } from '@/utils/learning'

const assistant = useAssistantStore()
const content = useContentStore()
const progress = useProgressStore()
const settings = useSettingsStore()
const draft = ref('')
const panelBody = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const dismiss = ref<HTMLButtonElement | null>(null)

watch(() => [settings.onlineAssistantEnabled, settings.assistantEnabled], () => {
    if (!settings.onlineAssistantEnabled || !settings.assistantEnabled)
        assistant.cancel()
})
watch(() => assistant.messages.length, async () => {
    await nextTick()
    panelBody.value?.scrollTo({ top: panelBody.value.scrollHeight, behavior: 'smooth' })
})
watch(() => assistant.isOpen, async (open) => {
    await nextTick()
    if (open)
        dismiss.value?.focus({ preventScroll: true })
    else
        trigger.value?.focus({ preventScroll: true })
})

const recentMistakes = computed(() => {
    const ids = Object.values(progress.records)
        .filter((record) => record.lastGrade === 'again')
        .sort((a, b) => (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? ''))
        .slice(0, 5)
        .map((record) => record.wordId)

    return ids.map((id) => content.wordsById[id]).filter(Boolean)
})

const dueCount = computed(() => {
    return content.words.filter((word) => isDue(progress.records[word.id])).length
})

async function send() {
    const message = draft.value
    const { activeScenario } = content
    draft.value = ''
    await assistant.send({
        message,
        context: {
            activeWord: content.activeWord,
            activeScenario: activeScenario && {
                title: activeScenario.title,
                chineseTitle: activeScenario.chineseTitle,
                mission: activeScenario.mission,
                dialogue: activeScenario.dialogue,
                task: { expectedKeywords: activeScenario.task.expectedKeywords },
            },
            learnerLevel: content.selectedLevel,
            dueCount: dueCount.value,
            masteredCount: progress.masteredCount,
            recentMistakes: recentMistakes.value,
        },
    })
}

function quickAsk(message: string) {
    draft.value = message
    void send()
}
</script>

<template>
    <div
        v-if="settings.assistantEnabled"
        class="assistant">
        <button
            ref="trigger"
            @click="assistant.toggle"
            class="assistant__bubble"
            type="button"
            :aria-expanded="assistant.isOpen"
            aria-label="Open AI tutor">
            <SparklesOutline></SparklesOutline>
        </button>

        <section
            v-if="assistant.isOpen"
            @keydown.esc="assistant.isOpen = false"
            class="assistant__panel"
            aria-label="AI tutor">
            <header class="assistant__header">
                <div>
                    <strong>AI Tutor</strong>
                    <span>{{ settings.onlineAssistantEnabled ? 'Online tutor enabled' : 'Local study notes' }}</span>
                </div>
                <button
                    ref="dismiss"
                    @click="assistant.toggle"
                    type="button"
                    aria-label="Close AI tutor">
                    <CloseOutline></CloseOutline>
                </button>
            </header>

            <div
                ref="panelBody"
                class="assistant__body">
                <details class="assistant__consent">
                    <summary>Online AI &amp; privacy</summary>
                    <p>Online AI shares your message, up to six recent online chat messages, current word or mission, level, review counts, and recent mistake words with this app's server and its AI provider. Online practice in Missions shares the topic, conversation, current mission and level. Avoid personal or sensitive details. Parents should supervise use.</p>
                    <label>
                        <input
                            @change="settings.setOnlineAssistantEnabled(($event.target as HTMLInputElement).checked)"
                            :checked="settings.onlineAssistantEnabled"
                            type="checkbox" />
                        Enable online AI for this device
                    </label>
                    <a
                        href="/privacy.html"
                        target="_blank"
                        rel="noopener">Privacy details</a>
                </details>

                <div class="assistant__quick">
                    <button
                        @click="quickAsk('Explain the current word with one example.')"
                        type="button"
                        :disabled="assistant.isLoading">Explain</button>
                    <button
                        @click="quickAsk('Create a mnemonic for the current word.')"
                        type="button"
                        :disabled="assistant.isLoading">Mnemonic</button>
                    <button
                        @click="quickAsk('Quiz me on my recent mistakes.')"
                        type="button"
                        :disabled="assistant.isLoading">Quiz me</button>
                    <button
                        @click="quickAsk('Role-play the current real-life scenario with me. Start with one short line in Chinese and wait for my reply.')"
                        type="button"
                        :disabled="assistant.isLoading">Role-play</button>
                    <button
                        @click="quickAsk('Make a focused 10-minute study plan from my level, due words, and recent mistakes.')"
                        type="button"
                        :disabled="assistant.isLoading">My plan</button>
                </div>

                <div
                    class="assistant__status"
                    role="status">{{ assistant.status }}</div>
                <div
                    class="assistant__messages"
                    role="log"
                    aria-label="Tutor conversation"
                    aria-live="polite">
                    <div
                        v-for="message in assistant.messages"
                        :key="message.id"
                        :class="['assistant__message', `assistant__message--${message.role}`]">
                        {{ message.content }}
                    </div>
                    <div
                        v-if="assistant.isLoading"
                        class="assistant__message assistant__message--assistant">
                        Thinking...
                    </div>
                </div>
            </div>

            <form
                @submit.prevent="send"
                class="assistant__form">
                <ChatbubbleEllipsesOutline></ChatbubbleEllipsesOutline>
                <input
                    v-model="draft"
                    type="text"
                    autocomplete="off"
                    maxlength="2000"
                    aria-label="Message to tutor"
                    placeholder="Ask about pronunciation, meaning, or grammar" />
                <button
                    type="submit"
                    aria-label="Send message"
                    :disabled="assistant.isLoading || !draft.trim()">
                    <SendOutline></SendOutline>
                </button>
            </form>
            <button
                @click="assistant.clearMessages"
                class="assistant__clear"
                type="button">Clear conversation</button>
        </section>
    </div>
</template>

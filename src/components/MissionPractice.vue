<script setup lang="ts">
import {
    computed,
    onBeforeUnmount,
    ref,
    watch,
} from 'vue'
import type { HskLevel, LearningScenario } from '@/types/learning'
import {
    type AssistantChatMessage,
    canUseOnlineAssistant,
    recentAssistantHistory,
    requestAssistantReply,
} from '@/services/assistant/client'
import { useSettingsStore } from '@/stores/settings'

interface OnlinePractice {
    interest: string
    level: HskLevel
    messages: AssistantChatMessage[]
}

const props = defineProps<{ scenario: LearningScenario }>()
const settings = useSettingsStore()
const savedPractice = computed(() => props.scenario.savedPractice)
const savedVisible = ref(false)
const showModel = ref(false)
const interest = ref('')
const answer = ref('')
const notice = ref('')
const loading = ref(false)
const onlinePractice = ref<OnlinePractice>()
const onlineAllowed = computed(() => canUseOnlineAssistant(settings))
let controller: AbortController | undefined

function stopRequest() {
    controller?.abort()
    controller = undefined
    loading.value = false
}

watch(onlineAllowed, (allowed) => {
    if (!allowed && loading.value) {
        stopRequest()
        notice.value = 'Online tutoring was turned off. Choose the offline lesson to keep practicing.'
    }
}, { flush: 'sync' })
onBeforeUnmount(stopRequest)

function openSavedPractice() {
    stopRequest()
    savedVisible.value = true
    onlinePractice.value = undefined
    answer.value = ''
    showModel.value = false
    notice.value = ''
}

async function sendPracticeTurn(topic: string, message: string, practice?: OnlinePractice) {
    const request = new AbortController()
    controller = request
    loading.value = true
    notice.value = practice ? 'Preparing the next turn…' : 'Preparing your AI lesson…'
    const { title, chineseTitle, mission, setting, level } = props.scenario
    const learnerLevel = practice?.level ?? (settings.dailyStudyLevel === 'all' ? level : settings.dailyStudyLevel)
    const conversation = practice?.messages ?? []
    const history = practice ? recentAssistantHistory([conversation[0], ...conversation.slice(1).slice(-5)], 1000) : []
    const result = await requestAssistantReply({
        message,
        context: {
            activeScenario: { title, chineseTitle, mission, setting },
            learnerLevel,
            missionPractice: { interest: topic, turn: practice ? 'reply' : 'lesson' },
        },
        history,
    }, settings, request)
    if (controller !== request)
        return

    controller = undefined
    loading.value = false
    if (result.mode === 'unavailable') {
        notice.value = `${result.reason}. You can choose the offline lesson.`

        return
    }
    if (result.mode === 'mock') {
        openSavedPractice()
        notice.value = 'Demo tutor · showing the saved offline lesson.'

        return
    }

    if (practice)
        conversation.push({ role: 'user', content: message })
    conversation.push({ role: 'assistant', content: result.reply })
    onlinePractice.value = { interest: topic, level: learnerLevel, messages: conversation }
    answer.value = ''
    notice.value = ''
}

function startPractice() {
    const topic = interest.value.trim()
    if (!topic || topic.length > 120 || loading.value)
        return

    if (!onlineAllowed.value || !navigator.onLine) {
        const search = topic.normalize('NFKC').toLowerCase()
        if (savedPractice.value.searchTerms.some((term) => search.includes(term)))
            openSavedPractice()
        else
            notice.value = `Choose “${savedPractice.value.title}” for offline practice. New topics need an online tutor connection.`

        return
    }

    savedVisible.value = false
    onlinePractice.value = undefined
    answer.value = ''
    void sendPracticeTurn(topic, topic)
}

function replyOnline() {
    const practice = onlinePractice.value
    const message = answer.value.trim()
    if (practice && message && message.length <= 1000 && onlineAllowed.value && !loading.value)
        void sendPracticeTurn(practice.interest, message, practice)
}
</script>

<template>
    <section
        class="mission-practice"
        aria-labelledby="mission-practice-title">
        <h3 id="mission-practice-title">Explore an interest</h3>
        <form @submit.prevent="startPractice">
            <label for="mission-interest">What would you like to practice?</label>
            <input
                id="mission-interest"
                v-model="interest"
                type="text"
                maxlength="120"
                autocomplete="off"
                :disabled="loading"
                :placeholder="`e.g. ${savedPractice.title} (${savedPractice.chineseTitle})`" />
            <div class="mission-practice__actions">
                <button
                    type="submit"
                    class="primary-action"
                    :disabled="!interest.trim() || loading">
                    {{ onlineAllowed ? 'Generate with AI' : 'Start practice' }}
                </button>
                <button
                    @click="openSavedPractice"
                    type="button"
                    class="secondary-action">
                    Offline lesson · {{ savedPractice.title }} <span lang="zh-Hans">{{ savedPractice.chineseTitle }}</span>
                </button>
            </div>
            <p v-if="!settings.assistantEnabled">
                Enable the AI tutor and Online AI tutoring in Settings to generate new topics.
            </p>
            <p v-else-if="!settings.onlineAssistantEnabled">
                For new topics, enable Online AI tutoring in Settings.
            </p>
            <p v-else-if="!onlineAllowed">This device needs a secure tutor connection to generate new topics.</p>
        </form>
        <p
            v-if="notice"
            class="mission-practice__notice"
            role="status">{{ notice }}</p>

        <article
            v-if="savedVisible"
            class="mission-practice__lesson"
            aria-label="Offline lesson">
            <header>
                <small>Offline lesson</small>
                <h4>{{ savedPractice.title }} · <span lang="zh-Hans">{{ savedPractice.chineseTitle }}</span></h4>
            </header>
            <div>
                <h5>Culture in context</h5>
                <p>{{ savedPractice.cultureNote }}</p>
            </div>
            <div>
                <h5>Useful expressions</h5>
                <ul class="mission-practice__expressions">
                    <li
                        v-for="expression in savedPractice.expressions"
                        :key="expression.zh">
                        <strong lang="zh-Hans">{{ expression.zh }}</strong>
                        <small>{{ expression.pinyin }}</small>
                        <span>{{ expression.en }}</span>
                    </li>
                </ul>
            </div>
            <div>
                <h5>Your turn</h5>
                <p>{{ savedPractice.goal }}</p>
                <div class="mission-practice__line">
                    <small>{{ savedPractice.openingLine.speaker }}</small>
                    <strong lang="zh-Hans">{{ savedPractice.openingLine.zh }}</strong>
                    <small>{{ savedPractice.openingLine.pinyin }}</small>
                    <span>{{ savedPractice.openingLine.en }}</span>
                </div>
            </div>
            <form @submit.prevent="showModel = true">
                <label for="offline-practice-reply">Your reply in Chinese</label>
                <textarea
                    id="offline-practice-reply"
                    v-model="answer"
                    @input="showModel = false"
                    maxlength="1000"
                    rows="2">
                </textarea>
                <button
                    type="submit"
                    class="secondary-action"
                    :disabled="!answer.trim() || showModel">
                    Show model reply
                </button>
            </form>
            <div
                v-if="showModel"
                class="mission-practice__line"
                role="status">
                <small>Model reply</small>
                <strong lang="zh-Hans">{{ savedPractice.modelReply.zh }}</strong>
                <small>{{ savedPractice.modelReply.pinyin }}</small>
                <span>{{ savedPractice.modelReply.en }}</span>
            </div>
        </article>

        <article
            v-if="onlinePractice"
            class="mission-practice__lesson"
            aria-label="AI-generated practice">
            <header>
                <small>AI-generated practice · HSK {{ onlinePractice.level }}</small>
                <h4>{{ onlinePractice.interest }}</h4>
            </header>
            <div
                class="mission-practice__conversation"
                role="log"
                aria-label="Practice conversation">
                <p
                    v-for="(message, index) in onlinePractice.messages"
                    :key="index">
                    <strong>{{ message.role === 'assistant' ? 'AI tutor' : 'You' }}</strong>
                    {{ message.content }}
                </p>
            </div>
            <form @submit.prevent="replyOnline">
                <label for="online-practice-reply">Your reply in Chinese</label>
                <textarea
                    id="online-practice-reply"
                    v-model="answer"
                    :disabled="loading || !onlineAllowed"
                    maxlength="1000"
                    rows="2">
                </textarea>
                <button
                    type="submit"
                    class="primary-action"
                    :disabled="!answer.trim() || loading || !onlineAllowed">
                    Send reply
                </button>
            </form>
        </article>
    </section>
</template>

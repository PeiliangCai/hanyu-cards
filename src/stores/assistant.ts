import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import type { AssistantContext } from '@/types/learning'
import {
    type AssistantChatMessage,
    canUseOnlineAssistant,
    recentAssistantHistory,
    requestAssistantReply,
} from '@/services/assistant/client'
import { useSettingsStore } from '@/stores/settings'

interface AssistantMessage extends AssistantChatMessage {
    id: string
    online?: boolean
}

interface SendAssistantPayload {
    message: string
    context: AssistantContext
}

function createMessage(role: AssistantMessage['role'], content: string, online = false): AssistantMessage {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content,
        online,
    }
}

function fallbackResponse(payload: SendAssistantPayload) {
    const word = payload.context.activeWord
    const scenario = payload.context.activeScenario
    if (scenario && payload.message.toLowerCase().includes('role-play')) {
        const firstLine = scenario.dialogue?.[0]

        return [
            `Practice “${scenario.title}” with this saved example:`,
            firstLine ? `${firstLine.speaker}: ${firstLine.zh}\n${firstLine.pinyin}` : scenario.mission,
            'Read the dialogue aloud and try the mission exercise. Interactive role-play requires online AI.',
        ].join('\n\n')
    }
    if (!word)
        return 'Choose a word or mission to see a saved study tip. Local notes do not generate answers to questions.'

    return [
        `${word.simplified} (${word.pinyin}) means "${word.english}".`,
        'Say it slowly, then use it in a short sentence. If you miss it, mark "Again" so it returns today.',
    ].join('\n\n')
}

export const useAssistantStore = defineStore('assistant', {
    state: () => ({
        isOpen: false,
        isLoading: false,
        status: 'Local study notes · nothing is sent online.',
        controller: null as AbortController | null,
        messages: [
            createMessage('assistant', 'Welcome! Use saved word and mission notes, or enable online AI to ask questions. AI answers can be inaccurate; check them against your course material.'),
        ] as AssistantMessage[],
    }),
    actions: {
        open() {
            this.isOpen = true
        },
        toggle() {
            this.isOpen = !this.isOpen
        },
        cancel() {
            this.controller?.abort()
            this.status = 'Online request stopped. Local study notes are available.'
        },
        clearMessages() {
            this.cancel()
            this.controller = null
            this.isLoading = false
            this.messages = []
            this.status = 'Conversation cleared from this page.'
        },
        async send(payload: SendAssistantPayload) {
            const trimmed = payload.message.trim()
            if (!trimmed || this.isLoading)
                return
            if (trimmed.length > 2000) {
                this.status = 'Please keep your message within 2,000 characters.'

                return
            }

            const settings = useSettingsStore()
            const online = canUseOnlineAssistant(settings)
            const history = recentAssistantHistory(this.messages.filter((message) => message.online))
            this.messages.push(createMessage('user', trimmed, online))
            const localReply = () => this.messages.push(createMessage('assistant', fallbackResponse(payload)))
            if (!online || (typeof navigator !== 'undefined' && !navigator.onLine)) {
                this.status = online ? 'You are offline · showing a saved study note.' : 'Local study notes · nothing is sent online.'
                // Local questions must not enter online history if consent is enabled later.
                this.messages[this.messages.length - 1].online = false
                localReply()
                this.messages = this.messages.slice(-60)

                return
            }

            this.isLoading = true
            const controller = markRaw(new AbortController())
            this.controller = controller
            this.status = 'Contacting the online tutor…'
            try {
                const result = await requestAssistantReply({ message: trimmed, context: payload.context, history }, settings, controller)
                if (this.controller !== controller)
                    return
                if (result.mode === 'unavailable') {
                    this.status = `${result.reason} · showing a saved study note.`
                    localReply()

                    return
                }

                const isMock = result.mode === 'mock'
                this.status = isMock ? 'Demo tutor · a saved response, not a generated AI answer.' : 'Online AI · check answers against your course material.'
                this.messages.push(createMessage('assistant', result.reply, !isMock))
            }
            finally {
                if (this.controller === controller) {
                    this.controller = null
                    this.isLoading = false
                    this.messages = this.messages.slice(-60)
                }
            }
        },
    },
})

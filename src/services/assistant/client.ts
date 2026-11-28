import type { AssistantContext } from '@/types/learning'
import type { useSettingsStore } from '@/stores/settings'
import { hasSecureNativeAssistantEndpoint } from '@/utils/native'

export interface AssistantChatMessage {
    role: 'assistant' | 'user'
    content: string
}

interface ChatRequest {
    message: string
    context: AssistantContext
    history: AssistantChatMessage[]
}

type ChatResult = { mode: 'online' | 'mock', reply: string } | { mode: 'unavailable', reason: string }

export function canUseOnlineAssistant(settings: ReturnType<typeof useSettingsStore>) {
    return settings.onlineAssistantEnabled && settings.assistantEnabled && hasSecureNativeAssistantEndpoint()
}

export function recentAssistantHistory(messages: AssistantChatMessage[], maxLength = 2000): AssistantChatMessage[] {
    return messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, maxLength) }))
}

export async function requestAssistantReply(payload: ChatRequest, settings: ReturnType<typeof useSettingsStore>, controller: AbortController): Promise<ChatResult> {
    if (!canUseOnlineAssistant(settings))
        return { mode: 'unavailable', reason: 'Online tutoring is unavailable for this session' }
    if (typeof navigator !== 'undefined' && !navigator.onLine)
        return { mode: 'unavailable', reason: 'You are offline' }

    const base = import.meta.env.VITE_ASSISTANT_API_URL?.trim().replace(/\/$/, '') ?? ''
    const { signal } = controller
    const stopped = { mode: 'unavailable', reason: 'Tutor request stopped or timed out' } as const
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
        const response = await fetch(`${base}/api/assistant/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal,
            body: JSON.stringify(payload),
        })
        if (signal.aborted)
            return stopped
        if (response.status === 429)
            return { mode: 'unavailable', reason: 'Tutor request limit reached. Try again later' }
        if ([401, 403, 503].includes(response.status))
            return { mode: 'unavailable', reason: 'Online tutoring is unavailable for this session' }
        if (!response.ok)
            return { mode: 'unavailable', reason: 'The tutor could not respond' }

        const data: unknown = await response.json()
        if (signal.aborted)
            return stopped
        if (!data || typeof data !== 'object' || !('reply' in data) || typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 12000)
            return { mode: 'unavailable', reason: 'The tutor returned an invalid reply' }
        if (!('mode' in data) || (data.mode !== 'mock' && data.mode !== 'online'))
            return { mode: 'unavailable', reason: 'The tutor returned an unknown reply source' }

        return { mode: data.mode, reply: data.reply.trim() }
    }
    catch {
        return signal.aborted ? stopped : { mode: 'unavailable', reason: 'Unable to reach the tutor' }
    }
    finally { clearTimeout(timer) }
}

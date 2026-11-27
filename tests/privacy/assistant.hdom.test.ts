// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssistantStore } from '@/stores/assistant'
import { useSettingsStore } from '@/stores/settings'
import type { AssistantContext } from '@/types/learning'

const context: AssistantContext = { learnerLevel: 1, dueCount: 0, masteredCount: 0, recentMistakes: [] }

describe('assistant privacy and reliability', () => {
    beforeEach(() => {
        localStorage.clear()
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

    it('does not contact a server without explicit opt-in, including old settings', async () => {
        localStorage.setItem('hanyu-settings-v1', JSON.stringify({ assistantEnabled: true }))
        const assistant = useAssistantStore()
        await assistant.send({ message: 'Explain this word', context })
        expect(useSettingsStore().onlineAssistantEnabled).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
        expect(assistant.status).toContain('nothing is sent')
    })

    it('validates saved preferences instead of treating strings as consent', () => {
        localStorage.setItem('hanyu-settings-v1', JSON.stringify({ onlineAssistantEnabled: 'true', ttsEnabled: 1 }))
        expect(useSettingsStore().onlineAssistantEnabled).toBe(false)
        expect(useSettingsStore().ttsEnabled).toBe(true)
    })

    it('does not send earlier local questions after online consent', async () => {
        const assistant = useAssistantStore()
        await assistant.send({ message: 'Private offline question', context })
        useSettingsStore().setOnlineAssistantEnabled(true)
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ reply: '你好', mode: 'online' })))
        await assistant.send({ message: 'Online question', context })
        const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
        expect(request.history).toEqual([])
        expect(request.message).toBe('Online question')
        expect(assistant.messages.at(-1)?.content).toBe('你好')
    })

    it('labels demo responses and rate limiting clearly', async () => {
        const assistant = useAssistantStore()
        useSettingsStore().setOnlineAssistantEnabled(true)
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ reply: 'Saved note', mode: 'mock' })))
        await assistant.send({ message: 'Help', context })
        expect(assistant.status).toContain('Demo tutor')
        vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 429 }))
        await assistant.send({ message: 'Again', context })
        expect(assistant.status).toContain('limit reached')
        expect(assistant.isLoading).toBe(false)
    })

    it('rejects oversized messages without a network request', async () => {
        useSettingsStore().setOnlineAssistantEnabled(true)
        await useAssistantStore().send({ message: 'x'.repeat(2001), context })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('aborts a stalled request and recovers the input state', async () => {
        vi.useFakeTimers()
        useSettingsStore().setOnlineAssistantEnabled(true)
        vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }))
        const assistant = useAssistantStore()
        const pending = assistant.send({ message: 'Help', context })
        await vi.advanceTimersByTimeAsync(25_000)
        await pending
        expect(assistant.isLoading).toBe(false)
        expect(assistant.status).toContain('timed out')
    })

    it('never restores a cleared conversation from an in-flight response', async () => {
        useSettingsStore().setOnlineAssistantEnabled(true)
        let resolveResponse!: (response: Response) => void
        vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { resolveResponse = resolve }))
        const assistant = useAssistantStore()
        const pending = assistant.send({ message: 'Help', context })
        assistant.clearMessages()
        resolveResponse(new Response(JSON.stringify({ reply: 'Late answer' })))
        await pending
        expect(assistant.messages).toEqual([])
        expect(assistant.isLoading).toBe(false)
    })

    it('shows storage errors without throwing while revoking consent', () => {
        const settings = useSettingsStore()
        settings.setOnlineAssistantEnabled(true)
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
        expect(() => settings.setOnlineAssistantEnabled(false)).not.toThrow()
        expect(settings.onlineAssistantEnabled).toBe(false)
        expect(settings.storageError).toContain('could not be saved')
        expect(localStorage.getItem('hanyu-settings-v1')).toBeNull()
    })
})

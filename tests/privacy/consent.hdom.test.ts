// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { type Component } from 'vue'
import {
    type VueWrapper,
    flushPromises,
    mount,
} from '@vue/test-utils'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import AIAssistant from '@/components/AIAssistant.vue'
import ShellLayout from '@/pages/ShellLayout.vue'
import { useAssistantStore } from '@/stores/assistant'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

const wrappers: VueWrapper[] = []
let assistant: ReturnType<typeof useAssistantStore> | undefined

beforeEach(() => {
    localStorage.clear()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

afterEach(async () => {
    assistant?.clearMessages()
    await flushPromises()
    for (const wrapper of wrappers.splice(0))
        wrapper.unmount()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function setup(component: Component = AIAssistant) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useProgressStore().hydrated = true
    const settings = useSettingsStore()
    settings.setOnlineAssistantEnabled(true)
    assistant = useAssistantStore()
    assistant.open()
    let requestSignal: AbortSignal | undefined
    const network = vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        requestSignal = options?.signal as AbortSignal
        requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', network)
    const wrapper = mount(component, {
        global: { plugins: [pinia], stubs: { RouterLink: true, RouterView: true } },
    })
    wrappers.push(wrapper)

    return { wrapper, settings, network, requestSignal: () => requestSignal }
}

describe('online AI consent in mounted components', () => {
    it.each(['online', 'assistant'] as const)('aborts an in-flight request when %s consent is disabled', async (switchName) => {
        const { wrapper, settings, network, requestSignal } = setup()
        await wrapper.get('.assistant__quick button').trigger('click')
        expect(network).toHaveBeenCalledTimes(1)
        expect(requestSignal()?.aborted).toBe(false)
        expect(assistant?.isLoading).toBe(true)

        if (switchName === 'online')
            settings.setOnlineAssistantEnabled(false)
        else
            settings.setAssistantEnabled(false)
        await flushPromises()

        expect(requestSignal()?.aborted).toBe(true)
        expect(assistant?.isLoading).toBe(false)
        expect(network).toHaveBeenCalledTimes(1)
        expect(assistant?.messages.some((message) => message.role === 'assistant' && message.online)).toBe(false)
    })

    it.each(['hanyu-settings-v1', null])('honors cross-tab revocation (%s), aborts a request, and keeps the next message offline', async (key) => {
        const { wrapper, settings, network, requestSignal } = setup(ShellLayout)
        await wrapper.get('.assistant__quick button').trigger('click')
        expect(network).toHaveBeenCalledTimes(1)
        expect(requestSignal()?.aborted).toBe(false)

        // Storage events are delivered to other tabs after the shared storage changes.
        if (key === null)
            localStorage.clear()
        else
            localStorage.setItem(key, JSON.stringify({ assistantEnabled: true, onlineAssistantEnabled: false }))
        window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
        await flushPromises()

        expect(settings.onlineAssistantEnabled).toBe(false)
        expect(requestSignal()?.aborted).toBe(true)
        expect(assistant?.isLoading).toBe(false)
        await wrapper.get('.assistant__form input').setValue('Help me study offline after consent was revoked.')
        await wrapper.get('.assistant__form').trigger('submit')
        await flushPromises()
        expect(network).toHaveBeenCalledTimes(1)
        expect(wrapper.get('.assistant__status').text()).toContain('nothing is sent online')
        expect(assistant?.messages.at(-1)?.online).toBe(false)
    })
})

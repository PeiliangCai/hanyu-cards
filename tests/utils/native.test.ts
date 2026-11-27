import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { hasSecureNativeAssistantEndpoint } from '@/utils/native'

describe('native assistant endpoint', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
    })

    it.each(['', '/api', 'http://assistant.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://user:secret@assistant.example'])('keeps a native app offline for %s', (endpoint) => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
        vi.stubEnv('VITE_ASSISTANT_API_URL', endpoint)
        expect(hasSecureNativeAssistantEndpoint()).toBe(false)
    })

    it('allows an explicitly configured HTTPS gateway in native builds', () => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
        vi.stubEnv('VITE_ASSISTANT_API_URL', 'https://assistant.example')
        expect(hasSecureNativeAssistantEndpoint()).toBe(true)
    })

    it('preserves the same-origin gateway in the browser', () => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
        vi.stubEnv('VITE_ASSISTANT_API_URL', '')
        expect(hasSecureNativeAssistantEndpoint()).toBe(true)
    })
})

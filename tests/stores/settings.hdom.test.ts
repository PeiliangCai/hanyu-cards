// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from '@/stores/settings'

describe('store/settings daily study set', () => {
    beforeEach(() => {
        localStorage.clear()
        setActivePinia(createPinia())
    })

    it('defaults old saved preferences to the combined HSK set', () => {
        localStorage.setItem('hanyu-settings-v1', JSON.stringify({
            ttsEnabled: false,
            assistantEnabled: true,
            showTraditional: true,
        }))
        setActivePinia(createPinia())
        const settings = useSettingsStore()

        expect(settings.dailyStudyLevel).toBe('all')
        expect(settings.ttsEnabled).toBe(false)
    })

    it('persists the scope used for future daily routes', () => {
        const settings = useSettingsStore()
        settings.setDailyStudyLevel(2)

        setActivePinia(createPinia())
        expect(useSettingsStore().dailyStudyLevel).toBe(2)
    })
})

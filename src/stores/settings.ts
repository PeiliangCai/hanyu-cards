import { defineStore } from 'pinia'
import type { HskLevel } from '@/types/learning'

const SETTINGS_KEY = 'hanyu-settings-v1'

export interface LearningPreferences {
    ttsEnabled: boolean
    assistantEnabled: boolean
    showTraditional: boolean
    dailyStudyLevel: HskLevel | 'all'
}

interface SettingsState extends LearningPreferences {
    onlineAssistantEnabled: boolean
    storageError: string | null
}

const defaults: SettingsState = {
    ttsEnabled: true,
    assistantEnabled: true,
    onlineAssistantEnabled: false,
    showTraditional: false,
    dailyStudyLevel: 'all',
    storageError: null,
}

export function validatePreferences(value: unknown): LearningPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid learning preferences. Your settings have not been replaced.')
    const raw = value as Record<string, unknown>
    for (const key of ['ttsEnabled', 'assistantEnabled', 'showTraditional']) {
        if (typeof raw[key] !== 'boolean')
            throw new Error('Invalid learning preferences. Your settings have not been replaced.')
    }
    const level = raw.dailyStudyLevel ?? 'all'
    if (level !== 'all' && level !== 1 && level !== 2 && level !== 3)
        throw new Error('Invalid daily study level. Your settings have not been replaced.')

    return {
        ttsEnabled: raw.ttsEnabled as boolean,
        assistantEnabled: raw.assistantEnabled as boolean,
        showTraditional: raw.showTraditional as boolean,
        dailyStudyLevel: level,
    }
}

function loadSettings(): SettingsState {
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
        if (!saved || typeof saved !== 'object' || Array.isArray(saved))
            return { ...defaults }

        const result = { ...defaults }
        for (const key of ['ttsEnabled', 'assistantEnabled', 'onlineAssistantEnabled', 'showTraditional'] as const) {
            const value = (saved as Record<string, unknown>)[key]
            if (typeof value === 'boolean')
                result[key] = value
        }
        if ('dailyStudyLevel' in saved && (saved.dailyStudyLevel === 1 || saved.dailyStudyLevel === 2 || saved.dailyStudyLevel === 3))
            result.dailyStudyLevel = saved.dailyStudyLevel

        return result
    }
    catch {
        return { ...defaults, storageError: 'Preferences could not be read. Online AI is off until you enable it.' }
    }
}

export const useSettingsStore = defineStore('settings', {
    state: () => loadSettings(),
    actions: {
        exportSettings(): LearningPreferences {
            return validatePreferences(this)
        },
        importSettings(value: unknown) {
            const preferences = validatePreferences(value)
            this.$patch(preferences)
            // Consent belongs to this browser session and is never restored from a file.
            this.onlineAssistantEnabled = false
            this.persist()
        },
        syncFromStorage() {
            this.$patch(loadSettings())
        },
        persist() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                    ttsEnabled: this.ttsEnabled,
                    assistantEnabled: this.assistantEnabled,
                    onlineAssistantEnabled: this.onlineAssistantEnabled,
                    showTraditional: this.showTraditional,
                    dailyStudyLevel: this.dailyStudyLevel,
                }))
                this.storageError = null
            }
            catch {
                this.storageError = 'Preferences could not be saved. They may reset when you close this page.'
                // A previously saved consent must never silently survive a failed revocation.
                try {
                    localStorage.removeItem(SETTINGS_KEY)
                }
                catch {
                    this.storageError = 'Preferences could not be saved. Clear site data in your browser before using this device again to remove saved AI consent.'
                }
            }
        },
        setTtsEnabled(value: boolean) {
            this.ttsEnabled = value
            this.persist()
        },
        setAssistantEnabled(value: boolean) {
            this.assistantEnabled = value
            if (!value)
                this.onlineAssistantEnabled = false
            this.persist()
        },
        setOnlineAssistantEnabled(value: boolean) {
            this.onlineAssistantEnabled = value
            this.persist()
        },
        setShowTraditional(value: boolean) {
            this.showTraditional = value
            this.persist()
        },
        setDailyStudyLevel(value: HskLevel | 'all') {
            if (value !== 'all' && value !== 1 && value !== 2 && value !== 3)
                return
            this.dailyStudyLevel = value
            this.persist()
        },
    },
})

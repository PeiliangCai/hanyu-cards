import { defineStore } from 'pinia'

const SETTINGS_KEY = 'hanyu-settings-v1'

interface SettingsState {
    ttsEnabled: boolean
    assistantEnabled: boolean
    onlineAssistantEnabled: boolean
    showTraditional: boolean
    storageError: string | null
}

const defaults: SettingsState = {
    ttsEnabled: true,
    assistantEnabled: true,
    onlineAssistantEnabled: false,
    showTraditional: false,
    storageError: null,
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

        return result
    }
    catch {
        return { ...defaults, storageError: 'Preferences could not be read. Online AI is off until you enable it.' }
    }
}

export const useSettingsStore = defineStore('settings', {
    state: () => loadSettings(),
    actions: {
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
    },
})

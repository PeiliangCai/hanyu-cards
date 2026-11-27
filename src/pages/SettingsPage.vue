<script setup lang="ts">
import {
    onMounted,
    ref,
    watch,
} from 'vue'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { levelOptions } from '@/utils/learning'
import { isNativeApp, shareNativeTextFile } from '@/utils/native'
import {
    MAX_BACKUP_BYTES,
    type ProgressBackup,
    parseProgressBackup,
} from '@/utils/progressBackup'

const progress = useProgressStore()
const settings = useSettingsStore()
const goal = ref(progress.dailyGoal)
const busy = ref(false)
const message = ref('')
const messageIsError = ref(false)
const pendingBackup = ref<ProgressBackup | null>(null)
let pendingText = ''

watch(() => progress.dailyGoal, (value) => { goal.value = value })
onMounted(() => { void progress.hydrate() })

function notify(value: string, error = false) {
    message.value = value
    messageIsError.value = error
}

async function saveGoal() {
    if (!Number.isFinite(goal.value) || goal.value < 5 || goal.value > 120 || !Number.isInteger(goal.value)) {
        notify('Enter a whole number between 5 and 120.', true)

        return
    }
    busy.value = true
    try {
        const saved = await progress.setDailyGoal(goal.value)
        goal.value = progress.dailyGoal
        notify(saved ? 'Daily review target saved.' : 'Your target is active for this visit, but could not be saved.', !saved)
    }
    finally {
        busy.value = false
    }
}

async function exportBackup() {
    busy.value = true
    try {
        const serialized = await progress.exportBackup()
        const filename = `hanyu-progress-${new Date().toISOString().slice(0, 10)}.json`
        if (isNativeApp()) {
            await shareNativeTextFile(filename, serialized)
            notify('Backup shared. Keep the file safe; it contains your learning history.')

            return
        }
        const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        notify('Backup download started. Keep the file safe; it contains your learning history.')
    }
    catch (error) {
        notify(error instanceof Error ? error.message : 'The backup could not be downloaded.', true)
    }
    finally {
        busy.value = false
    }
}

function cancelImport() {
    pendingBackup.value = null
    pendingText = ''
}

async function chooseBackup(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    cancelImport()
    if (!file)
        return
    busy.value = true
    message.value = ''
    try {
        if (file.size > MAX_BACKUP_BYTES)
            throw new Error('The backup is too large. Choose a JSON backup smaller than 5 MB.')
        const serialized = await file.text()
        const backup = parseProgressBackup(serialized)
        pendingText = serialized
        pendingBackup.value = backup
    }
    catch (error) {
        notify(error instanceof Error ? error.message : 'The file could not be read. Your progress has not changed.', true)
    }
    finally {
        input.value = ''
        busy.value = false
    }
}

async function confirmImport() {
    if (!pendingBackup.value || busy.value)
        return
    busy.value = true
    try {
        const saved = await progress.importBackup(pendingText)
        if (saved) {
            cancelImport()
            notify('Backup restored. Your learning progress and daily target are now saved on this device.')
        }
        else {
            notify('Import was not completed. Your existing progress has not been replaced.', true)
        }
    }
    catch (error) {
        notify(error instanceof Error ? error.message : 'Import failed. Your progress has not changed.', true)
    }
    finally {
        busy.value = false
    }
}

async function retrySave() {
    busy.value = true
    try {
        const saved = await progress.persist()
        notify(saved ? 'Your progress is saved on this device.' : 'Progress is still unsaved. Download a backup before closing.', !saved)
    }
    finally {
        busy.value = false
    }
}

async function reset() {
    if (!window.confirm('Permanently delete all learning progress on this device? Download a backup first if you may need it. Your daily target and preferences will be kept.'))
        return
    busy.value = true
    try {
        const saved = await progress.resetProgress()
        if (saved)
            cancelImport()
        notify(saved ? 'Local learning progress has been reset.' : 'Reset failed. Your existing progress has not been deleted.', !saved)
    }
    finally {
        busy.value = false
    }
}
</script>

<template>
    <section class="screen settings-screen">
        <div class="screen__intro">
            <div>
                <p class="eyebrow">Device settings</p>
                <h2>Learning preferences</h2>
            </div>
        </div>

        <div
            v-if="progress.storageError || settings.storageError"
            class="backup-notice backup-notice--error"
            role="alert">
            <p v-if="progress.storageError">{{ progress.storageError }}</p>
            <p v-if="settings.storageError">{{ settings.storageError }}</p>
            <button
                v-if="progress.storageError && !progress.storageBlocked"
                @click="retrySave"
                :disabled="busy"
                class="primary-action"
                type="button">Retry Saving Progress</button>
        </div>

        <label class="daily-set-field">
            <span>Daily study set</span>
            <select
                @change="settings.setDailyStudyLevel(($event.target as HTMLSelectElement).value === 'all' ? 'all' : Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3)"
                :value="settings.dailyStudyLevel"
                aria-label="Choose the word level for future daily routes">
                <option
                    v-for="option in levelOptions"
                    :key="option.value"
                    :value="option.value">{{ option.label }}</option>
            </select>
            <small>The next new route uses this level. A route already started today stays fixed.</small>
        </label>

        <div class="settings-list">
            <label>
                <span>
                    <strong>Pronunciation audio</strong>
                    <small>Use device speech synthesis for Mandarin.</small>
                </span>
                <input
                    @change="settings.setTtsEnabled(($event.target as HTMLInputElement).checked)"
                    :checked="settings.ttsEnabled"
                    type="checkbox" />
            </label>

            <label>
                <span>
                    <strong>AI tutor floating button</strong>
                    <small>Show the tutor button and local learning notes.</small>
                </span>
                <input
                    @change="settings.setAssistantEnabled(($event.target as HTMLInputElement).checked)"
                    :checked="settings.assistantEnabled"
                    type="checkbox" />
            </label>

            <label>
                <span>
                    <strong>Online AI tutoring</strong>
                    <small>Allow messages, the last six chat messages, the current word or mission, your level, review statistics, and recent mistakes to be sent to the configured server and AI provider. Turn off at any time. Local notes work offline.</small>
                </span>
                <input
                    @change="settings.setOnlineAssistantEnabled(($event.target as HTMLInputElement).checked)"
                    :checked="settings.onlineAssistantEnabled"
                    type="checkbox" />
            </label>

            <label>
                <span>
                    <strong>Traditional characters</strong>
                    <small>Show traditional forms when available.</small>
                </span>
                <input
                    @change="settings.setShowTraditional(($event.target as HTMLInputElement).checked)"
                    :checked="settings.showTraditional"
                    type="checkbox" />
            </label>
        </div>

        <form
            @submit.prevent="saveGoal"
            class="goal-form">
            <label for="daily-goal">Daily review target</label>
            <input
                id="daily-goal"
                v-model.number="goal"
                :disabled="busy"
                type="number"
                min="5"
                max="120"
                step="1"
                required />
            <button
                :disabled="busy"
                class="primary-action"
                type="submit">Save Goal</button>
        </form>

        <article class="privacy-note backup-panel">
            <h3>Back up your learning</h3>
            <p>Progress is stored in this browser on this device. Clearing browser data or uninstalling can remove it. Download a backup regularly, or use one to move your progress to another device.</p>
            <p>Backups include word reviews, daily plans, mistakes, practice scores, mission results, study time, your daily target, and learning preferences. Chat messages and online AI consent are excluded. Files are not encrypted; keep them somewhere private.</p>
            <div class="backup-actions">
                <button
                    @click="exportBackup"
                    :disabled="busy"
                    class="primary-action"
                    type="button">Download Progress Backup</button>
                <label for="progress-backup">Choose a backup to restore (JSON, up to 5 MB)</label>
                <input
                    id="progress-backup"
                    @change="chooseBackup"
                    :disabled="busy"
                    type="file"
                    accept=".json,application/json" />
            </div>
            <div
                v-if="pendingBackup"
                class="backup-preview"
                aria-labelledby="backup-preview-title">
                <h4 id="backup-preview-title">Review before restoring</h4>
                <p>Exported {{ new Date(pendingBackup.exportedAt).toLocaleString() }}.</p>
                <ul>
                    <li>{{ Object.keys(pendingBackup.data.records).length }} word records</li>
                    <li>{{ pendingBackup.data.sessions.length }} study days</li>
                    <li>{{ pendingBackup.data.completedScenarioIds.length }} completed missions</li>
                    <li>{{ pendingBackup.data.dailyGoal }} reviews per day</li>
                </ul>
                <p><strong>This replaces all current learning progress and any backed-up learning preferences on this device. Online AI stays off after preferences are restored. Download your current backup first to keep a copy.</strong></p>
                <div class="backup-confirm-actions">
                    <button
                        @click="confirmImport"
                        :disabled="busy"
                        class="danger-action"
                        type="button">Replace Local Progress</button>
                    <button
                        @click="cancelImport"
                        :disabled="busy"
                        class="primary-action"
                        type="button">Cancel Import</button>
                </div>
            </div>
        </article>

        <p
            v-if="message"
            class="backup-notice"
            :class="{ 'backup-notice--error': messageIsError }"
            :role="messageIsError ? 'alert' : 'status'">{{ message }}</p>

        <article class="privacy-note">
            <h3>Privacy</h3>
            <p>Your word list and learning progress are stored on this device. Online AI tutoring is optional and disabled until you enable it. When enabled, sending a message shares the context described above with the configured server and its AI provider.</p>
            <a href="/privacy.html">Read the privacy notice</a>
        </article>

        <button
            @click="reset"
            :disabled="busy"
            class="danger-action"
            type="button">
            Reset Local Progress
        </button>
    </section>
</template>

<style scoped>
.backup-panel p,
.backup-notice p {
    margin-bottom: 0.75rem;
}

.backup-actions {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
}

.backup-actions input {
    max-width: 100%;
}

.backup-preview {
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid #b7c8c9;
    border-radius: 0.75rem;
}

.backup-preview ul {
    margin: 0.75rem 0;
    padding-left: 1.25rem;
}

.backup-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
}

.backup-notice {
    padding: 1rem;
    border: 1px solid #9bbdb2;
    border-radius: 0.75rem;
    background: #eef7f1;
}

.backup-notice--error {
    border-color: #d8a5a0;
    background: #fff1ef;
    color: #852d27;
}

button:disabled,
input:disabled {
    cursor: wait;
    opacity: 0.6;
}
</style>

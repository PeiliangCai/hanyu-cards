// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import {
    type VueWrapper,
    flushPromises,
    mount,
} from '@vue/test-utils'
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import SettingsPage from '@/pages/SettingsPage.vue'
import { useProgressStore } from '@/stores/progress'
import { serializeProgressBackup } from '@/utils/progressBackup'

const storage = vi.hoisted(() => ({ value: null as unknown, get: vi.fn(), set: vi.fn() }))
vi.mock('localforage', () => ({ default: { config: vi.fn(), getItem: storage.get, setItem: storage.set } }))

const restoreData = {
    dailyGoal: 60,
    records: {},
    sessions: [{ date: '2026-01-01', reviewed: 2, correct: 1, xp: 6 }],
    completedScenarioIds: ['first-meeting'],
}

beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    storage.value = null
    storage.get.mockImplementation(async () => storage.value)
    storage.set.mockImplementation(async (_key: string, value: unknown) => {
        storage.value = value

        return value
    })
})

async function setup() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(SettingsPage, { global: { plugins: [pinia] } })
    await flushPromises()

    return { wrapper, progress: useProgressStore() }
}

async function chooseFile(wrapper: VueWrapper, serialized: string) {
    const input = wrapper.get('#progress-backup')
    Object.defineProperty(input.element, 'files', {
        value: [new File([serialized], 'progress.json', { type: 'application/json' })], configurable: true,
    })
    await input.trigger('change')
    await flushPromises()
}

describe('settings backup and recovery flow', () => {
    it('shows imported data for review and only replaces progress after confirmation', async () => {
        const { wrapper, progress } = await setup()
        await chooseFile(wrapper, serializeProgressBackup(restoreData))
        expect(wrapper.get('.backup-preview').text()).toContain('1 study days')
        expect(wrapper.get('.backup-preview').text()).toContain('replaces all current learning progress')
        expect(progress.dailyGoal).toBe(24)
        expect(storage.set).not.toHaveBeenCalled()
        await wrapper.get('.backup-preview .danger-action').trigger('click')
        await flushPromises()
        expect(progress.dailyGoal).toBe(60)
        expect(progress.completedScenarioIds).toEqual(['first-meeting'])
        expect(wrapper.find('.backup-preview').exists()).toBe(false)
        expect(wrapper.get('[role="status"]').text()).toContain('Backup restored')
        wrapper.unmount()
    })

    it('cancels an import without changing or writing any progress', async () => {
        const { wrapper, progress } = await setup()
        await chooseFile(wrapper, serializeProgressBackup(restoreData))
        await wrapper.get('.backup-preview .primary-action').trigger('click')
        expect(wrapper.find('.backup-preview').exists()).toBe(false)
        expect(progress.dailyGoal).toBe(24)
        expect(storage.set).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('rejects a damaged file without offering an import confirmation', async () => {
        const { wrapper, progress } = await setup()
        const backup = JSON.parse(serializeProgressBackup(restoreData))
        backup.data.dailyGoal = 0
        await chooseFile(wrapper, JSON.stringify(backup))
        expect(wrapper.find('.backup-preview').exists()).toBe(false)
        expect(wrapper.get('[role="alert"]').text()).toContain('daily goal')
        expect(progress.dailyGoal).toBe(24)
        expect(storage.set).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('keeps existing progress and shows a visible error when restore cannot be saved', async () => {
        const { wrapper, progress } = await setup()
        await progress.completeScenario('existing-mission')
        await chooseFile(wrapper, serializeProgressBackup(restoreData))
        storage.set.mockRejectedValueOnce(new Error('Quota exceeded'))
        await wrapper.get('.backup-preview .danger-action').trigger('click')
        await flushPromises()
        expect(progress.completedScenarioIds).toEqual(['existing-mission'])
        expect(progress.dailyGoal).toBe(24)
        expect(wrapper.text()).toContain('Import was not completed')
        expect(wrapper.text()).toContain('could not be saved on this device')
        expect(wrapper.find('.backup-preview').exists()).toBe(true)
        wrapper.unmount()
    })

    it('updates the goal input after saved progress finishes loading', async () => {
        storage.value = restoreData
        const { wrapper } = await setup()
        expect((wrapper.get('#daily-goal').element as HTMLInputElement).value).toBe('60')
        wrapper.unmount()
    })
})

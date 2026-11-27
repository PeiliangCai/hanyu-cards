// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import ScenariosPage from '@/pages/ScenariosPage.vue'
import localforage from 'localforage'
import { useProgressStore } from '@/stores/progress'

describe('page/ScenariosPage', () => {
    beforeEach(async () => {
        await localforage.clear()
        localStorage.clear()
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('checks an applied response and completes the active mission', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(ScenariosPage, {
            global: {
                plugins: [pinia],
            },
        })
        const progress = useProgressStore()

        expect(wrapper.text()).toContain('Real-life missions')
        expect(wrapper.text()).toContain('初次见面')
        expect(wrapper.findAll('.scenario-tab')).toHaveLength(6)

        await wrapper.get('textarea').setValue('我叫安娜，我是英国人，我学习汉语。')
        await wrapper.get('.scenario-task .primary-action').trigger('click')
        await flushPromises()

        await vi.waitFor(() => expect(wrapper.get('.task-feedback').text()).toContain('Mission complete'))
        expect(progress.completedScenarioIds).toContain('first-meeting')
        expect(wrapper.text()).toContain('1/6')
        expect(wrapper.text()).toContain('17% explored')
    })

    it('keeps an incomplete mission out of completed progress', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(ScenariosPage, {
            global: {
                plugins: [pinia],
            },
        })
        const progress = useProgressStore()
        progress.completedScenarioIds = []

        await wrapper.get('textarea').setValue('我叫安娜。')
        await wrapper.get('.scenario-task .primary-action').trigger('click')
        await flushPromises()

        await vi.waitFor(() => expect(wrapper.get('.task-feedback').text()).toContain('Good start'))
        expect(progress.completedScenarioIds).not.toContain('first-meeting')
        expect(progress.scenarioProgress['first-meeting'].attempts).toBe(1)
        expect(wrapper.text()).toContain('17% explored')
        expect(wrapper.text()).toContain('0/6')
    })

    it('keeps mission answers local and does not claim to assess grammar', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const pinia = createPinia()
        setActivePinia(pinia)
        await useProgressStore().hydrate()
        const wrapper = mount(ScenariosPage, { global: { plugins: [pinia] } })
        await wrapper.get('textarea').setValue('我叫安娜，我是英国人，我学习汉语。')
        await wrapper.get('.scenario-task .primary-action').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('.task-feedback').exists()).toBe(true))
        expect(fetchMock).not.toHaveBeenCalled()
        expect(wrapper.get('.task-feedback').text()).toContain('grammar and fluency are not assessed')
        expect(wrapper.find('.evaluation-dimensions').text()).not.toContain('Language accuracy')
        wrapper.unmount()
    })
})

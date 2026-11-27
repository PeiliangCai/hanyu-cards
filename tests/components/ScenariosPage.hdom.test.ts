// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ScenariosPage from '@/pages/ScenariosPage.vue'
import localforage from 'localforage'
import { useProgressStore } from '@/stores/progress'

describe('page/ScenariosPage', () => {
    beforeEach(async () => {
        localStorage.clear()
        await localforage.clear()
    })

    it('does not complete a mission for unrelated text', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        await useProgressStore().hydrate()
        const wrapper = mount(ScenariosPage, { global: { plugins: [pinia] } })
        await wrapper.get('textarea').setValue('hello')
        await wrapper.get('.scenario-task .primary-action').trigger('click')
        await flushPromises()
        expect(useProgressStore().completedScenarioIds).toEqual([])
        expect(wrapper.get('.task-feedback').text()).toContain('Try one')
    })

    it('checks an applied response and completes the active mission', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        await useProgressStore().hydrate()
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

        expect(wrapper.get('.task-feedback').text()).toContain('Mission complete')
        expect(progress.completedScenarioIds).toContain('first-meeting')
    })
})

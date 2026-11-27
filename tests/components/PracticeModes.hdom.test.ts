// @vitest-environment happy-dom

import localforage from 'localforage'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PracticePage from '@/pages/PracticePage.vue'
import { useProgressStore } from '@/stores/progress'

describe('page/PracticePage', () => {
    beforeEach(async () => {
        localStorage.clear()
        await localforage.clear()
    })

    it('ends ten questions on a round summary instead of silently restarting', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(PracticePage, {
            global: {
                plugins: [pinia],
                stubs: {
                    RouterLink: { template: '<a><slot /></a>' },
                },
            },
        })
        const progress = useProgressStore()
        await progress.hydrate()
        await flushPromises()

        for (let index = 0; index < 10; index += 1) {
            await wrapper.findAll('.quiz-options button')[0].trigger('click')
            await wrapper.get('.quiz-panel > .primary-action').trigger('click')
            await vi.waitFor(() => expect(wrapper.get('.quiz-panel > .primary-action').attributes('disabled')).toBeUndefined())

            if (index < 9)
                await wrapper.get('.quiz-panel > .primary-action').trigger('click')
        }

        expect(wrapper.get('.quiz-panel > .primary-action').text()).toContain('View round summary')
        expect(progress.todaySession.reviewed).toBe(10)
        expect(progress.todayPlanCompletedCount).toBe(0)

        await wrapper.get('.quiz-panel > .primary-action').trigger('click')

        expect(wrapper.get('.practice-round-summary').text()).toContain('Round complete')
        expect(wrapper.get('.practice-round-summary').text()).toContain('not the separate daily-card route')
        expect(wrapper.get('.practice-round-summary').text()).toContain('Start another 10-question round')
        wrapper.unmount()
    })
})

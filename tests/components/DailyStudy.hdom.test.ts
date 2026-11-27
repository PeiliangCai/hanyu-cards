// @vitest-environment happy-dom

import localforage from 'localforage'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import {
    createMemoryHistory,
    createRouter,
} from 'vue-router'
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import StudyPage from '@/pages/StudyPage.vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'

const EmptyRoute = { template: '<div></div>' }

describe('page/StudyPage focused word', () => {
    beforeEach(async () => {
        localStorage.clear()
        await localforage.clear()
    })

    it('studies the word selected in Words without increasing the daily route', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const content = useContentStore()
        const progress = useProgressStore()
        const selectedWord = content.words.at(-1)!
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { name: 'study', path: '/study', component: StudyPage },
                { path: '/:pathMatch(.*)*', component: EmptyRoute },
            ],
        })
        await router.push({ name: 'study', query: { word: selectedWord.id } })
        await router.isReady()
        const wrapper = mount(StudyPage, {
            global: {
                plugins: [pinia, router],
            },
        })
        await flushPromises()
        await vi.waitFor(() => {
            expect(wrapper.find('.focused-study-strip').exists()).toBe(true)
        })

        expect(wrapper.get('.focused-study-strip').text()).toContain(selectedWord.simplified)
        expect(wrapper.get('.focused-study-strip').text()).toContain('does not change your fixed daily-card route')
        expect(wrapper.get('.word-card__hanzi').text()).toBe(selectedWord.simplified)
        expect(progress.todayPlan?.wordIds).not.toContain(selectedWord.id)

        await wrapper.get('.word-card__reveal .primary-action').trigger('click')
        await wrapper.get('.review-button--good').trigger('click')
        await flushPromises()
        await vi.waitFor(() => {
            expect(wrapper.find('.focused-study-complete').exists()).toBe(true)
        })

        expect(progress.todaySession.reviewed).toBe(1)
        expect(progress.todayPlanCompletedCount).toBe(0)
        expect(progress.todayExtraWordCount).toBe(1)
        expect(progress.todaySession.extraWordIds).toEqual([selectedWord.id])
        expect(wrapper.get('.deck-status').text()).toContain('+1 extra word')
        expect(wrapper.get('.focused-study-complete').text()).toContain('daily-card count remains 0/24')
        wrapper.unmount()
    })
})

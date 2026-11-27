// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
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
import { dailyPlanKey, todayKey } from '@/utils/learning'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

const storage = vi.hoisted(() => ({ value: null as unknown, get: vi.fn(), set: vi.fn() }))
vi.mock('localforage', () => ({ default: { config: vi.fn(), getItem: storage.get, setItem: storage.set } }))

beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    storage.value = null
    storage.get.mockImplementation(async () => storage.value)
    storage.set.mockImplementation(async (_key: string, value: unknown) => { storage.value = value; return value })
})

describe('study review lifecycle', () => {
    it('records rapid repeated grades once and keeps the next answer hidden while saving', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const progress = useProgressStore()
        await progress.hydrate()
        const [first, second] = useContentStore().filteredWords
        await progress.ensureDailyPlan(dailyPlanKey(todayKey()), todayKey(), 'all', [first.id, second.id])
        storage.set.mockClear()
        let finishSaving!: () => void
        storage.set.mockImplementation(async (_key: string, value: unknown) => {
            await new Promise<void>((resolve) => { finishSaving = resolve })
            storage.value = value

            return value
        })
        const review = vi.spyOn(progress, 'reviewWord')
        const wrapper = mount(StudyPage, { global: { plugins: [pinia], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
        await flushPromises()
        await wrapper.get('.word-card .primary-action').trigger('click')
        expect(wrapper.get('.word-card__answer').text()).toContain(first.english)
        const grade = wrapper.get('.review-button--good')
        await Promise.all([grade.trigger('click'), grade.trigger('click')])
        await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1))

        expect(review).toHaveBeenCalledTimes(1)
        expect(progress.records[first.id].reviews).toBe(1)
        expect(progress.records[second.id]).toBeUndefined()
        expect(wrapper.get('.word-card__hanzi').text()).toBe(second.simplified)
        expect(wrapper.find('.word-card__answer').exists()).toBe(false)
        expect(wrapper.get('.word-card .primary-action').text()).toContain('Reveal meaning')
        expect(wrapper.get('.review-button--good').attributes('disabled')).toBeDefined()

        finishSaving()
        await flushPromises()
        expect(review).toHaveBeenCalledTimes(1)
        expect(progress.todaySession.reviewed).toBe(1)
        expect(wrapper.find('.word-card__answer').exists()).toBe(false)
        await wrapper.get('.word-card .primary-action').trigger('click')
        expect(wrapper.get('.word-card__answer').text()).toContain(second.english)
        wrapper.unmount()
    })
})

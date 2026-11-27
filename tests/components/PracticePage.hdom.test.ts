// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import PracticePage from '@/pages/PracticePage.vue'
import { useProgressStore } from '@/stores/progress'
import { useContentStore } from '@/stores/content'

describe('practice answer lifecycle', () => {
    beforeEach(() => { localStorage.clear() })
    it('records once and resets the selection when the level changes', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const save = vi.spyOn(useProgressStore(), 'reviewWord').mockResolvedValue(true)
        const wrapper = mount(PracticePage, { global: { plugins: [pinia] } })
        await wrapper.get('.quiz-options button').trigger('click')
        const check = wrapper.get('.primary-action')
        await Promise.all([check.trigger('click'), check.trigger('click')])
        expect(save).toHaveBeenCalledTimes(1)
        await wrapper.get('select').setValue('2')
        expect(wrapper.find('.quiz-feedback').exists()).toBe(false)
        expect(wrapper.get('.primary-action').attributes('disabled')).toBeDefined()
        expect(wrapper.get('.primary-action').text()).toBe('Check Answer')
    })

    it('reaches the 401st word instead of silently repeating the first 400', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const content = useContentStore()
        vi.spyOn(useProgressStore(), 'reviewWord').mockResolvedValue(true)
        const wrapper = mount(PracticePage, { global: { plugins: [pinia] } })
        for (let index = 0; index < 400; index++) {
            await wrapper.get('.quiz-options button').trigger('click')
            await wrapper.get('.primary-action').trigger('click')
            await wrapper.get('.primary-action').trigger('click')
        }
        expect(wrapper.get('.quiz-panel__hanzi').text()).toBe(content.filteredWords[400].simplified)
        expect(content.activeWordId).toBe(content.filteredWords[400].id)
        wrapper.unmount()
    })

    it('resets an answered question when the shared search changes the word pool', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        vi.spyOn(useProgressStore(), 'reviewWord').mockResolvedValue(true)
        const wrapper = mount(PracticePage, { global: { plugins: [pinia] } })
        await wrapper.get('.quiz-options button').trigger('click')
        await wrapper.get('.primary-action').trigger('click')
        useContentStore().searchTerm = 'hello'
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.quiz-feedback').exists()).toBe(false)
        expect(wrapper.get('.primary-action').attributes('disabled')).toBeDefined()
        wrapper.unmount()
    })
})

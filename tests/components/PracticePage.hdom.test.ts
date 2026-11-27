// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import localforage from 'localforage'
import PracticePage from '@/pages/PracticePage.vue'
import { useProgressStore } from '@/stores/progress'
import { useContentStore } from '@/stores/content'

async function setup() {
    const pinia = createPinia()
    setActivePinia(pinia)
    await useProgressStore().hydrate()
    const save = vi.spyOn(useProgressStore(), 'reviewWord').mockResolvedValue(true)
    const wrapper = mount(PracticePage, { global: { plugins: [pinia] } })
    await flushPromises()

    return { save, wrapper }
}

describe('practice answer lifecycle', () => {
    beforeEach(async () => { localStorage.clear(); await localforage.clear() })
    afterEach(() => vi.restoreAllMocks())

    it('records once and resets the selection when the practice level changes', async () => {
        const { save, wrapper } = await setup()
        await wrapper.get('.quiz-options button').trigger('click')
        const check = wrapper.get('.quiz-panel > .primary-action')
        await Promise.all([check.trigger('click'), check.trigger('click')])
        expect(save).toHaveBeenCalledTimes(1)
        await wrapper.get('select').setValue('2')
        expect(wrapper.find('.quiz-feedback').exists()).toBe(false)
        expect(wrapper.get('.quiz-panel > .primary-action').attributes('disabled')).toBeDefined()
        expect(wrapper.get('.quiz-panel > .primary-action').text()).toBe('Check Answer')
        wrapper.unmount()
    })

    it('keeps the practice question independent of dictionary search', async () => {
        const { wrapper } = await setup()
        const wordId = useContentStore().activeWordId
        await wrapper.get('.quiz-options button').trigger('click')
        await wrapper.get('.quiz-panel > .primary-action').trigger('click')
        useContentStore().searchTerm = 'hello'
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.quiz-feedback').exists()).toBe(true)
        expect(useContentStore().activeWordId).toBe(wordId)
        wrapper.unmount()
    })
})

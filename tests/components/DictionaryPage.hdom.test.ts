// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import {
    mount,
    RouterLinkStub,
} from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import DictionaryPage from '@/pages/DictionaryPage.vue'

describe('page/DictionaryPage', () => {
    it('paginates the dictionary without rendering the full result set', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(DictionaryPage, {
            global: {
                plugins: [pinia],
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
        })

        expect(wrapper.findAll('.word-row')).toHaveLength(20)
        expect(wrapper.get('.pagination-controls').text()).toContain('Page 1 of')
        expect(wrapper.get('.pagination-controls').text()).toContain('1–20 of')

        await wrapper.findAll('.pagination-controls button')[1].trigger('click')
        await nextTick()

        expect(wrapper.findAll('.word-row')).toHaveLength(20)
        expect(wrapper.get('.pagination-controls').text()).toContain('Page 2 of')
        expect(wrapper.get('.pagination-controls').text()).toContain('21–40 of')
        wrapper.unmount()
    })

    it('links the selected dictionary word to focused study', () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(DictionaryPage, {
            global: {
                plugins: [pinia],
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
        })
        const studyLink = wrapper.getComponent(RouterLinkStub)

        expect(studyLink.props('to')).toEqual({
            name: 'study',
            query: { word: 'hsk1-0001' },
        })
        wrapper.unmount()
    })
})

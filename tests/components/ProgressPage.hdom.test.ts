// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import ProgressPage from '@/pages/ProgressPage.vue'
import { useContentStore } from '@/stores/content'
import { useProgressStore } from '@/stores/progress'

describe('page/ProgressPage', () => {
    it('moves a level bar as soon as the first word has been reviewed', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const wrapper = mount(ProgressPage, {
            global: {
                plugins: [pinia],
                stubs: {
                    RouterLink: { template: '<a><slot /></a>' },
                },
            },
        })
        const content = useContentStore()
        const progress = useProgressStore()
        const word = content.words.find((item) => item.level === 1)!

        progress.records[word.id] = {
            wordId: word.id,
            reviews: 1,
            correct: 1,
            streak: 1,
            ease: 2.55,
            status: 'learning',
            lastGrade: 'good',
            lastReviewedAt: new Date().toISOString(),
            nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
        }
        await nextTick()

        const level = wrapper.findAll('.level-progress article')[0]
        expect(level.text()).toContain(`1/${content.levelCounts[1]} started`)
        expect(level.text()).toContain('0 mastered')
        expect(level.get('.progress-track i').classes()).toContain('has-progress')
        wrapper.unmount()
    })

    it('paginates started words at twenty rows per page', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const content = useContentStore()
        const progress = useProgressStore()
        content.words.slice(0, 25).forEach((word) => {
            progress.records[word.id] = {
                wordId: word.id,
                reviews: 1,
                correct: 1,
                streak: 1,
                ease: 2.55,
                status: 'learning',
                lastGrade: 'good',
                lastReviewedAt: new Date().toISOString(),
                nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
            }
        })
        const wrapper = mount(ProgressPage, {
            global: {
                plugins: [pinia],
                stubs: {
                    RouterLink: { template: '<a><slot /></a>' },
                },
            },
        })

        expect(wrapper.findAll('.progress-word-list > a')).toHaveLength(20)
        expect(wrapper.get('.pagination-controls').text()).toContain('Page 1 of 2')

        await wrapper.findAll('.pagination-controls button')[1].trigger('click')
        await nextTick()

        expect(wrapper.findAll('.progress-word-list > a')).toHaveLength(5)
        expect(wrapper.get('.pagination-controls').text()).toContain('Page 2 of 2')
        wrapper.unmount()
    })
})

// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { learningScenarios } from '@/data/scenarios'
import ScenariosPage from '@/pages/ScenariosPage.vue'
import { useAssistantStore } from '@/stores/assistant'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

function mountMissions() {
    const pinia = createPinia()
    setActivePinia(pinia)

    return mount(ScenariosPage, { global: { plugins: [pinia] } })
}

const generatedLesson = [
    'Culture in context: Ask whether the price can change before making an offer.',
    'Useful expressions: 能便宜一点吗？ Néng piányi yìdiǎn ma? Could it be a little cheaper?',
    'Your turn: Offer 80 yuan. Seller: 这件外套一百块。',
].join('\n')

describe('mission interest practice', () => {
    const fetchMock = vi.fn<typeof fetch>()

    beforeEach(() => {
        localStorage.clear()
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => vi.unstubAllGlobals())

    it('offers a distinct saved dialogue in each mission', async () => {
        const wrapper = mountMissions()
        const tabs = wrapper.findAll('.scenario-tab')
        expect(tabs).toHaveLength(learningScenarios.length)
        for (const [index, scenario] of learningScenarios.entries()) {
            await tabs[index].trigger('click')
            await wrapper.get('.mission-practice__actions .secondary-action').trigger('click')
            const lesson = wrapper.get('[aria-label="Offline lesson"]')
            expect(lesson.text()).toContain(scenario.savedPractice.title)
            expect(lesson.text()).toContain(scenario.savedPractice.openingLine.zh)
        }
        expect(fetchMock).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('finds the bargaining exercise from a typed Chinese question and offers a model reply offline', async () => {
        const wrapper = mountMissions()
        await wrapper.findAll('.scenario-tab')[2].trigger('click')
        await wrapper.get('#mission-interest').setValue('怎么砍价？')
        await wrapper.get('.mission-practice > form').trigger('submit')

        const lesson = wrapper.get('[aria-label="Offline lesson"]')
        expect(lesson.text()).toContain('Bargaining · 砍价')
        expect(lesson.text()).toContain('street markets')
        expect(lesson.text()).toContain('usually fixed')
        expect(lesson.text()).toContain('能便宜一点吗？')
        expect(lesson.text()).toContain('这件外套一百块。')
        expect(lesson.text()).not.toContain('Model reply')
        await lesson.get('textarea').setValue('能便宜一点吗？八十块可以吗？')
        await lesson.get('form').trigger('submit')
        expect(lesson.get('[role="status"]').text()).toContain('能便宜一点吗？八十块可以吗？')
        expect(useProgressStore().scenarioProgress).toEqual({})
        expect(fetchMock).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('generates a lesson for a free-form topic and continues the same practice after opt-in', async () => {
        const wrapper = mountMissions()
        const settings = useSettingsStore()
        const message = 'How do I politely make an offer at a market stall?'
        await wrapper.findAll('.scenario-tab')[2].trigger('click')
        await wrapper.get('#mission-interest').setValue(message)
        await wrapper.get('.mission-practice > form').trigger('submit')
        expect(wrapper.get('.mission-practice__notice').text()).toContain('New topics need an online tutor connection')
        expect(fetchMock).not.toHaveBeenCalled()

        settings.setOnlineAssistantEnabled(true)
        settings.setDailyStudyLevel(1)
        fetchMock.mockResolvedValueOnce(Response.json({ reply: generatedLesson, mode: 'online' }))
        await wrapper.get('.mission-practice > form').trigger('submit')
        await flushPromises()
        const lesson = wrapper.get('[aria-label="AI-generated practice"]')
        expect(lesson.text()).toContain('HSK 1')
        expect(lesson.text()).toContain('Useful expressions')
        expect(lesson.text()).toContain('这件外套一百块。')
        const lessonRequest = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
        expect(lessonRequest).toMatchObject({
            message,
            context: {
                activeScenario: { title: 'Buy clothes' },
                learnerLevel: 1,
                missionPractice: { interest: message, turn: 'lesson' },
            },
            history: [],
        })
        expect(lessonRequest.context).not.toHaveProperty('activeWord')
        expect(lessonRequest.context).not.toHaveProperty('recentMistakes')

        settings.setDailyStudyLevel(3)
        const answer = '八十块可以吗？'
        fetchMock.mockResolvedValueOnce(Response.json({ reply: '九十块，可以吗？', mode: 'online' }))
        await lesson.get('textarea').setValue(answer)
        await lesson.get('form').trigger('submit')
        await flushPromises()
        expect(lesson.text()).toContain(answer)
        expect(lesson.text()).toContain('九十块，可以吗？')
        expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({
            message: answer,
            context: { learnerLevel: 1, missionPractice: { interest: message, turn: 'reply' } },
            history: [{ role: 'assistant', content: generatedLesson }],
        })
        expect(useAssistantStore().messages).toHaveLength(1)
        wrapper.unmount()
    })

    it('opens the offline lesson with a demo label when the server is in demo mode', async () => {
        const wrapper = mountMissions()
        useSettingsStore().setOnlineAssistantEnabled(true)
        fetchMock.mockResolvedValueOnce(Response.json({ reply: 'Saved note', mode: 'mock' }))
        await wrapper.get('#mission-interest').setValue('How do I meet a new teacher?')
        await wrapper.get('.mission-practice > form').trigger('submit')
        await flushPromises()
        expect(wrapper.get('.mission-practice__notice').text()).toContain('Demo tutor')
        expect(wrapper.get('[aria-label="Offline lesson"]').text()).toContain('Forms of address')
        expect(wrapper.find('[aria-label="AI-generated practice"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('cancels generation and ignores a late reply when the learner changes mission', async () => {
        const wrapper = mountMissions()
        useSettingsStore().setOnlineAssistantEnabled(true)
        let finish!: (response: Response) => void
        fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
        await wrapper.get('#mission-interest').setValue('How do I meet a new teacher?')
        await wrapper.get('.mission-practice > form').trigger('submit')
        await wrapper.findAll('.scenario-tab')[2].trigger('click')
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
        finish(Response.json({ reply: generatedLesson, mode: 'online' }))
        await flushPromises()
        expect(wrapper.find('[aria-label="AI-generated practice"]').exists()).toBe(false)
        expect(wrapper.get('.mission-practice__actions').text()).toContain('Bargaining')
        wrapper.unmount()
    })

    it('stops an in-flight request if consent is revoked and leaves the saved lesson available', async () => {
        const wrapper = mountMissions()
        const settings = useSettingsStore()
        settings.setOnlineAssistantEnabled(true)
        let finish!: (response: Response) => void
        fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
        await wrapper.get('#mission-interest').setValue('How do I greet a new classmate?')
        await wrapper.get('.mission-practice > form').trigger('submit')
        settings.setOnlineAssistantEnabled(false)
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
        finish(Response.json({ reply: generatedLesson, mode: 'online' }))
        await flushPromises()
        expect(wrapper.find('[aria-label="AI-generated practice"]').exists()).toBe(false)
        expect(wrapper.get('.mission-practice__notice').text()).toContain('Online tutoring was turned off')
        await wrapper.get('.mission-practice__actions .secondary-action').trigger('click')
        expect(wrapper.get('[aria-label="Offline lesson"]').text()).toContain('Forms of address')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        wrapper.unmount()
    })
})

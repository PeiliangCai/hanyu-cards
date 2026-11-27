/// <reference types="cypress" />

import './commands'

beforeEach(() => {
    cy.intercept('GET', '**/health', {
        body: { ok: true },
    })
    cy.intercept('POST', '**/api/assistant/chat', {
        body: { reply: 'Mock tutor response for end-to-end tests.' },
        headers: { 'X-Assistant-Source': 'mock' },
    })
    cy.intercept('POST', '**/api/assistant/evaluate-scenario', {
        body: {
            passed: true,
            score: 90,
            feedback: 'Mission complete. The requested meaning is clear.',
            strengths: ['All required ideas are present.'],
            improvements: [],
            source: 'mock',
            dimensions: {
                completeness: 94,
                naturalness: 86,
                accuracy: 90,
            },
            followUp: 'Introduce yourself again using a different reason for learning Chinese.',
        },
        headers: { 'X-Assistant-Source': 'mock' },
    })
})

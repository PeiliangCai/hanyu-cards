import type {
    LearningScenario,
    ScenarioEvaluation,
    ScenarioEvaluationSource,
} from '@/types/learning'

export function matchedScenarioKeywords(scenario: LearningScenario, response: string) {
    const normalized = response.replace(/[\s，。！？、,.!?]/g, '')

    return scenario.task.expectedKeywords.filter((keyword) => normalized.includes(keyword))
}

export function evaluateScenarioLocally(
    scenario: LearningScenario,
    response: string,
    source: ScenarioEvaluationSource = 'local',
): ScenarioEvaluation {
    const matched = matchedScenarioKeywords(scenario, response)
    const missing = scenario.task.expectedKeywords.filter((keyword) => !matched.includes(keyword))
    const coverage = scenario.task.expectedKeywords.length ? matched.length / scenario.task.expectedKeywords.length : 0
    const passed = scenario.task.expectedKeywords.length > 0 && missing.length === 0

    return {
        passed,
        score: Math.round(coverage * 100),
        feedback: passed
            ? 'Mission complete. Your response includes every target phrase. This local check does not assess grammar or fluency.'
            : matched.length
                ? `Good start. You covered ${matched.length} of ${scenario.task.expectedKeywords.length} target parts.`
                : 'Build your answer around the mission requirements, then check it again.',
        strengths: matched.map((keyword) => `Included “${keyword}”.`),
        improvements: missing.map((keyword) => `Express the idea represented by “${keyword}”.`),
        source,
        dimensions: {
            completeness: Math.round(coverage * 100),
            naturalness: 0,
            accuracy: 0,
        },
        followUp: passed
            ? 'Can you say the same message one more time using different words?'
            : `Can you add the missing idea “${missing[0] ?? scenario.task.expectedKeywords[0]}”?`,
    }
}

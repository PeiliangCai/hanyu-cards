export type HskLevel = 1 | 2 | 3

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export interface WordExample {
    zh: string
    pinyin?: string
    en: string
}

export interface HskWord {
    id: string
    level: HskLevel
    simplified: string
    traditional: string
    pinyin: string
    numericPinyin: string
    english: string
    partOfSpeech: string[]
    radical: string
    frequency?: number
    examples: WordExample[]
    tags: string[]
}

export interface WordProgress {
    wordId: string
    reviews: number
    correct: number
    streak: number
    ease: number
    lastGrade?: ReviewGrade
    lastReviewedAt?: string
    nextReviewAt?: string
    status: 'new' | 'learning' | 'reviewing' | 'mastered'
    mistakeCount?: number
    lastMistakeAt?: string
    needsMistakeReview?: boolean
}

export interface StudySession {
    date: string
    reviewed: number
    correct: number
    xp: number
    studySeconds?: number
    extraWordIds?: string[]
}

export type PracticeMode = 'meaning' | 'hanzi' | 'pinyin' | 'listening' | 'context'

export interface PracticeModeStats {
    attempts: number
    correct: number
}

export interface DailyStudyPlan {
    key: string
    date: string
    level: HskLevel | 'all'
    goal: number
    wordIds: string[]
    completedWordIds: string[]
    results: Record<string, ReviewGrade>
    createdAt: string
    completedAt?: string
}

export interface ScenarioVocabulary {
    simplified: string
    pinyin: string
    english: string
    usage: string
}

export interface ScenarioDialogueLine {
    speaker: string
    zh: string
    pinyin: string
    en: string
}

export interface ScenarioTask {
    prompt: string
    hint: string
    expectedKeywords: string[]
    modelAnswer: WordExample
}

export interface SavedMissionPractice {
    title: string
    chineseTitle: string
    searchTerms: string[]
    cultureNote: string
    expressions: WordExample[]
    goal: string
    openingLine: ScenarioDialogueLine
    modelReply: WordExample
}

export interface LearningScenario {
    id: string
    level: HskLevel
    title: string
    chineseTitle: string
    setting: string
    mission: string
    durationMinutes: number
    objectives: string[]
    vocabulary: ScenarioVocabulary[]
    dialogue: ScenarioDialogueLine[]
    cultureTitle: string
    cultureNote: string
    task: ScenarioTask
    savedPractice: SavedMissionPractice
}

export interface AssistantContext {
    activeWord?: HskWord
    activeScenario?: Pick<LearningScenario, 'title' | 'chineseTitle' | 'mission'>
        & Partial<Pick<LearningScenario, 'setting' | 'dialogue'>>
        & { task?: Pick<ScenarioTask, 'expectedKeywords'> }
    learnerLevel: HskLevel | 'all'
    dueCount?: number
    masteredCount?: number
    recentMistakes?: HskWord[]
    missionPractice?: {
        interest: string
        turn: 'lesson' | 'reply'
    }
}

export type ScenarioEvaluationSource = 'agicto' | 'local' | 'mock'

export interface ScenarioEvaluation {
    passed: boolean
    score: number
    feedback: string
    strengths: string[]
    improvements: string[]
    source: ScenarioEvaluationSource
    dimensions: ScenarioEvaluationDimensions
    followUp: string
}

export interface ScenarioEvaluationDimensions {
    completeness: number
    naturalness: number
    accuracy: number
}

export interface ScenarioProgress {
    scenarioId: string
    attempts: number
    bestScore: number
    lastScore: number
    lastAttemptAt: string
    bestDimensions: ScenarioEvaluationDimensions
    followUp: string
    source: ScenarioEvaluationSource
}

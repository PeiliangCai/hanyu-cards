export class RequestError extends Error {
    constructor(status, code, message) {
        super(message)
        this.status = status
        this.code = code
    }
}

function invalid(field) {
    throw new RequestError(400, 'INVALID_REQUEST', `Invalid ${field}. Check its type and length.`)
}

function object(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        invalid(field)
    return value
}

function string(value, field, max, optional = false) {
    if (value === undefined && optional)
        return undefined
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        invalid(field)
    return value.trim()
}

function array(value, field, max) {
    if (!Array.isArray(value) || value.length > max)
        invalid(field)
    return value
}

function count(value, field) {
    if (value === undefined)
        return undefined
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000)
        invalid(field)
    return value
}

function word(value, field) {
    object(value, field)
    return {
        simplified: string(value.simplified, `${field}.simplified`, 100),
        pinyin: string(value.pinyin, `${field}.pinyin`, 200),
        english: string(value.english, `${field}.english`, 500),
    }
}

function scenario(value) {
    object(value, 'context.activeScenario')
    const dialogue = value.dialogue === undefined ? [] : array(value.dialogue, 'context.activeScenario.dialogue', 16).map(line => {
        object(line, 'dialogue line')
        return {
            speaker: string(line.speaker, 'dialogue speaker', 80),
            zh: string(line.zh, 'dialogue Chinese', 500),
            pinyin: string(line.pinyin, 'dialogue pinyin', 700, true),
            en: string(line.en, 'dialogue English', 700, true),
        }
    })
    let expectedKeywords
    if (value.task !== undefined) {
        object(value.task, 'context.activeScenario.task')
        if (value.task.expectedKeywords !== undefined)
            expectedKeywords = array(value.task.expectedKeywords, 'task.expectedKeywords', 20).map(item => string(item, 'task keyword', 100))
    }
    return {
        title: string(value.title, 'scenario title', 200),
        chineseTitle: string(value.chineseTitle, 'scenario Chinese title', 200, true),
        mission: string(value.mission, 'scenario mission', 1000),
        dialogue,
        task: { expectedKeywords },
    }
}

export function validateChat(body) {
    object(body, 'request body')
    if (Object.keys(body).some(key => !['message', 'context', 'history'].includes(key)))
        invalid('request fields')
    const message = string(body.message, 'message (maximum 2000 characters)', 2000)
    const source = body.context === undefined ? {} : object(body.context, 'context')
    if (source.learnerLevel !== undefined && ![1, 2, 3, 'all'].includes(source.learnerLevel))
        invalid('context.learnerLevel')
    // Only the tutoring fields below leave this process. Full card metadata is ignored.
    const context = {
        activeWord: source.activeWord === undefined ? undefined : word(source.activeWord, 'context.activeWord'),
        activeScenario: source.activeScenario === undefined ? undefined : scenario(source.activeScenario),
        learnerLevel: source.learnerLevel,
        dueCount: count(source.dueCount, 'context.dueCount'),
        masteredCount: count(source.masteredCount, 'context.masteredCount'),
        recentMistakes: source.recentMistakes === undefined ? [] : array(source.recentMistakes, 'context.recentMistakes', 5).map(item => word(item, 'recent mistake')),
    }
    const history = body.history === undefined ? [] : array(body.history, 'history (maximum 6 messages)', 6).map(item => {
        object(item, 'history entry')
        if (!['user', 'assistant'].includes(item.role))
            invalid('history role')
        return { role: item.role, content: string(item.content, 'history content', 2000) }
    })
    const result = { message, context, history }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 24 * 1024)
        throw new RequestError(400, 'CONTEXT_TOO_LARGE', 'Combined message, context, and history must fit within 24 KB.')
    return result
}

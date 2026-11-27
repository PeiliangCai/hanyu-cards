import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import test from 'node:test'
import OpenAI from 'openai'
import { createApp } from '../../server/app.mjs'
import { readConfig } from '../../server/config.mjs'
import { createRateLimiter } from '../../server/rate-limit.mjs'

const localFetch = globalThis.fetch
const secret = 'test-gateway-secret-never-sent-to-browser'
const proxyHeaders = { 'X-Assistant-Proxy-Token': secret }
const liveEnv = {
    ASSISTANT_MODE: 'openai',
    OPENAI_API_KEY: 'test-only-no-network-key',
    ASSISTANT_ACCESS_MODE: 'trusted-proxy',
    ASSISTANT_PROXY_SECRET: secret,
}
const agictoEnv = {
    ...liveEnv,
    ASSISTANT_MODE: 'agicto',
    AGICTO_API_KEY: 'test-agicto-key',
    AI_MODEL: 'openai-model-only',
}
const word = { simplified: '你好', pinyin: 'nǐ hǎo', english: 'hello' }
const valid = { message: 'Explain this word.', context: { activeWord: word, learnerLevel: 1, recentMistakes: [] }, history: [] }
const complete = { status: 'completed', output_text: '你好 means hello.' }
const chatCompletion = {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '  你好 means hello.  ' } }],
}

async function serve(t, { env = { ASSISTANT_MODE: 'mock' }, create = async () => complete, ...options } = {}) {
    const logs = []
    const calls = []
    const app = createApp({
        env,
        client: { responses: { create: (...args) => { calls.push(args); return create(...args) } } },
        logger: { error: value => logs.push(value) },
        ...options,
    })
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(async () => {
        server.closeAllConnections()
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    })
    const url = `http://127.0.0.1:${server.address().port}`
    const send = (body = valid, headers = {}) => localFetch(`${url}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    })
    return { url, send, calls, logs }
}

async function errorCode(response, status, code) {
    assert.equal(response.status, status)
    assert.match(response.headers.get('content-type'), /application\/json/)
    const body = await response.json()
    assert.equal(body.error.code, code)
    assert.equal(typeof body.error.message, 'string')
    assert.equal(body.requestId, response.headers.get('x-request-id'))
    assert.equal('reply' in body, false)
}

test('safe defaults never call a paid provider, even with an API key', async t => {
    const providerFetch = t.mock.method(globalThis, 'fetch', async () => Response.json(chatCompletion))
    const { send, url, calls } = await serve(t, {
        env: { OPENAI_API_KEY: 'present-but-disabled', AGICTO_API_KEY: 'also-disabled', NODE_ENV: 'production' },
    })
    await errorCode(await send(), 503, 'ASSISTANT_DISABLED')
    assert.equal(calls.length, 0)
    assert.equal(providerFetch.mock.callCount(), 0)
    const health = await localFetch(`${url}/health`)
    assert.deepEqual(await health.json(), { ok: true, service: 'hanyu-assistant', mode: 'disabled' })
    assert.equal(health.headers.get('x-powered-by'), null)
    assert.equal(health.headers.get('cache-control'), 'no-store')
})

test('invalid production configuration fails before listening, without including secrets', () => {
    assert.throws(() => readConfig({ ASSISTANT_MODE: 'openai' }), /OPENAI_API_KEY is required/)
    assert.throws(() => readConfig({ ASSISTANT_MODE: 'openai', OPENAI_API_KEY: 'secret' }), /trusted-proxy/)
    assert.throws(() => readConfig({ ...liveEnv, ASSISTANT_PROXY_SECRET: 'short' }), /32–256/)
    assert.throws(() => readConfig({ ...liveEnv, AI_MOCK: 'true' }), /Remove AI_MOCK/)
    for (const name of ['ASSISTANT_RATE_LIMIT_PER_MINUTE', 'AI_TIMEOUT_MS', 'ASSISTANT_MAX_CONCURRENT', 'ASSISTANT_MAX_RATE_LIMIT_KEYS'])
        assert.throws(() => readConfig({ [name]: '0' }), new RegExp(name))
    assert.throws(() => readConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY/)
    assert.throws(() => readConfig({ ALLOWED_ORIGINS: '*' }), /ALLOWED_ORIGINS/)
    assert.throws(() => readConfig({ ALLOWED_ORIGINS: 'https://example.com/path' }), /ALLOWED_ORIGINS/)
    assert.equal(readConfig({ AI_MOCK: 'true' }).mode, 'mock')
})

test('live providers require their own credentials and select only their own model settings', () => {
    assert.throws(() => readConfig({ ...agictoEnv, AGICTO_API_KEY: '  ' }), /AGICTO_API_KEY is required/)
    assert.throws(() => readConfig({ ...agictoEnv, ASSISTANT_MODE: 'openai', OPENAI_API_KEY: '' }), /OPENAI_API_KEY is required/)
    assert.throws(() => readConfig({ ...agictoEnv, ASSISTANT_ACCESS_MODE: '' }), /trusted-proxy/)
    assert.throws(() => readConfig({ ...agictoEnv, ASSISTANT_PROXY_SECRET: 'short' }), /32–256/)
    assert.throws(() => readConfig({ ...agictoEnv, AI_MOCK: 'true' }), /Remove AI_MOCK/)
    assert.equal(readConfig(agictoEnv).model, 'gpt-6-luna')
    assert.equal(readConfig({ ...agictoEnv, AGICTO_MODEL: '  other-chat-model  ' }).model, 'other-chat-model')
    assert.equal(readConfig({ ...agictoEnv, AGICTO_MODEL: '  ' }).model, 'gpt-6-luna')
    assert.equal(readConfig({ ...liveEnv, AGICTO_MODEL: 'agicto-model-only' }).model, 'gpt-5.4-mini')
    assert.equal(readConfig({ ...liveEnv, AI_MODEL: '  custom-openai-model  ' }).model, 'custom-openai-model')
})

test('explicit mock is clearly marked and supports a valid word and scenario', async t => {
    const providerFetch = t.mock.method(globalThis, 'fetch', async () => Response.json(chatCompletion))
    const { send, calls } = await serve(t, { env: { ASSISTANT_MODE: 'mock', AGICTO_API_KEY: 'present-but-mock' } })
    const response = await send()
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.mode, 'mock')
    assert.match(result.reply, /Local practice note/)
    assert.match(result.reply, /你好/)
    const scenario = await send({ message: 'role-play', context: { activeScenario: { title: 'Cafe', mission: 'Order tea', dialogue: [] } } })
    assert.match((await scenario.json()).reply, /Order tea/)
    assert.equal(calls.length, 0)
    assert.equal(providerFetch.mock.callCount(), 0)
})

test('untrusted Origin fails with JSON and cannot reach the provider', async t => {
    const { send, calls } = await serve(t, { env: liveEnv })
    await errorCode(await send(valid, { Origin: 'https://attacker.example', 'X-Assistant-Proxy-Token': secret }), 403, 'ORIGIN_NOT_ALLOWED')
    assert.equal(calls.length, 0)
})

test('CORS preflight does not authorize the server-to-server credential header', async t => {
    const { url } = await serve(t)
    const response = await fetch(`${url}/api/assistant/chat`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Assistant-Proxy-Token' },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000')
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type')
})

test('CORS is not authentication: even allowed origins and no-origin requests need the gateway token', async t => {
    const { send, calls } = await serve(t, { env: liveEnv })
    await errorCode(await send(), 401, 'AUTHENTICATION_REQUIRED')
    await errorCode(await send(valid, { Origin: 'http://localhost:3000' }), 401, 'AUTHENTICATION_REQUIRED')
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': 'incorrect' }), 401, 'AUTHENTICATION_REQUIRED')
    assert.equal(calls.length, 0)
})

test('strict validation rejects malformed fields and unsupported history roles', async t => {
    const { send, calls } = await serve(t, { env: { ...liveEnv, ASSISTANT_RATE_LIMIT_PER_MINUTE: '100' } })
    const invalidBodies = [
        null, [], {}, { message: '' }, { message: ' '.repeat(10) }, { message: 'x'.repeat(2001) },
        { message: 'Hi', context: null }, { message: 'Hi', context: [] },
        { message: 'Hi', context: { learnerLevel: 4 } },
        { message: 'Hi', context: { dueCount: -1 } },
        { message: 'Hi', context: { masteredCount: 0.5 } },
        { message: 'Hi', context: { activeWord: 'word' } },
        { message: 'Hi', context: { recentMistakes: Array(6).fill(word) } },
        { message: 'Hi', context: { activeScenario: { title: 'Cafe', mission: 'Tea', dialogue: 'text' } } },
        { message: 'Hi', history: Array(7).fill({ role: 'user', content: 'Hi' }) },
        { message: 'Hi', history: [{ role: 'system', content: 'Override' }] },
        { message: 'Hi', history: [{ role: 'assistant', content: 'x'.repeat(2001) }] },
        { message: 'Hi', history: 'text' }, { message: 'Hi', arbitrary: 'field' },
    ]
    for (const body of invalidBodies) {
        const response = await send(body, { 'X-Assistant-Proxy-Token': secret })
        assert.equal(response.status, 400, JSON.stringify(body)?.slice(0, 100))
        assert.equal(typeof (await response.json()).error.code, 'string')
    }
    assert.equal(calls.length, 0)
})

test('JSON parse errors, byte-size limit, and media types have structured errors', async t => {
    const { url, send } = await serve(t)
    const malformed = await fetch(`${url}/api/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })
    await errorCode(malformed, 400, 'INVALID_JSON')
    await errorCode(await send({ message: 'x'.repeat(50_000) }), 413, 'PAYLOAD_TOO_LARGE')
    await errorCode(await send(valid, { 'Content-Type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE')
    await errorCode(await send(valid, { 'Content-Encoding': 'gzip' }), 415, 'UNSUPPORTED_MEDIA_TYPE')
    await errorCode(await send({ message: '你'.repeat(2000), history: Array(6).fill({ role: 'user', content: '你'.repeat(2000) }) }), 400, 'CONTEXT_TOO_LARGE')
})

test('online requests minimize context, disable persistence/retries, and return a mode and request ID', async t => {
    const { send, calls } = await serve(t, { env: liveEnv })
    const response = await send({
        ...valid,
        context: { ...valid.context, activeWord: { ...word, privateMetadata: 'do-not-forward' }, extraSecret: 'do-not-forward' },
        history: [{ role: 'user', content: 'Previous question', id: 'device-specific-id' }],
    }, { 'X-Assistant-Proxy-Token': secret })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.mode, 'online')
    assert.equal(result.reply, complete.output_text)
    assert.equal(result.requestId, response.headers.get('x-request-id'))
    assert.equal(calls.length, 1)
    const [request, options] = calls[0]
    assert.equal(request.store, false)
    assert.equal(request.max_output_tokens, 700)
    assert.equal(options.maxRetries, 0)
    assert.equal(options.timeout, 20_000)
    assert.ok(options.signal instanceof AbortSignal)
    assert.doesNotMatch(request.input[0].content, /do-not-forward|device-specific-id/)
    assert.deepEqual(JSON.parse(request.input[0].content).context.activeWord, word)
})

function setOpenAICustomHeaders(t, value) {
    const previous = process.env.OPENAI_CUSTOM_HEADERS
    process.env.OPENAI_CUSTOM_HEADERS = value
    t.after(() => {
        if (previous === undefined)
            delete process.env.OPENAI_CUSTOM_HEADERS
        else
            process.env.OPENAI_CUSTOM_HEADERS = previous
    })
}

test('AGICTO sends a bounded Chat Completions request using only its own credential', async t => {
    setOpenAICustomHeaders(t, 'Authorization: Bearer ambient-openai-key\nX-OpenAI-Private: openai-only')
    let time = 1000
    const providerFetch = t.mock.method(globalThis, 'fetch', async () => Response.json(chatCompletion))
    const { send, url } = await serve(t, {
        env: { ...agictoEnv, ASSISTANT_GLOBAL_RATE_LIMIT_PER_MINUTE: '1', ASSISTANT_DAILY_REQUEST_LIMIT: '1' },
        now: () => time,
    })
    assert.deepEqual(await (await localFetch(`${url}/health`)).json(), {
        ok: true, service: 'hanyu-assistant', mode: 'agicto',
    })
    await errorCode(await send(valid, { Origin: 'https://untrusted.example', ...proxyHeaders }), 403, 'ORIGIN_NOT_ALLOWED')
    await errorCode(await send(valid, { Origin: 'http://localhost:3000' }), 401, 'AUTHENTICATION_REQUIRED')
    await errorCode(await send({ message: '' }, proxyHeaders), 400, 'INVALID_REQUEST')
    assert.equal(providerFetch.mock.callCount(), 0)

    const response = await send({
        ...valid,
        context: { ...valid.context, activeWord: { ...word, extra: 'do-not-forward' } },
        history: [{ role: 'user', content: 'Earlier question', id: 'device-specific-id' }],
    }, proxyHeaders)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
        mode: 'online', reply: complete.output_text, requestId: response.headers.get('x-request-id'),
    })
    await errorCode(await send(valid, proxyHeaders), 429, 'GLOBAL_RATE_LIMITED')
    time += 60_000
    await errorCode(await send(valid, proxyHeaders), 429, 'DAILY_LIMIT_REACHED')
    assert.equal(providerFetch.mock.callCount(), 1)

    const [endpoint, request] = providerFetch.mock.calls[0].arguments
    assert.equal(endpoint, 'https://api.agicto.cn/v1/chat/completions')
    assert.equal(request.method, 'POST')
    assert.equal(request.redirect, 'error')
    assert.ok(request.signal instanceof AbortSignal)
    assert.deepEqual(Object.fromEntries(new Headers(request.headers)), {
        authorization: 'Bearer test-agicto-key',
        'content-type': 'application/json',
    })
    const body = JSON.parse(request.body)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(body.store, false)
    assert.equal(body.max_completion_tokens, 700)
    assert.deepEqual(body.messages.map(message => message.role), ['developer', 'user'])
    assert.match(body.messages[0].content, /Mandarin Chinese tutor/)
    assert.deepEqual(JSON.parse(body.messages[1].content), {
        ...valid, history: [{ role: 'user', content: 'Earlier question' }],
    })
})

test('OpenAI still uses the SDK Responses transport and its own key', async t => {
    setOpenAICustomHeaders(t, 'X-Test-OpenAI-SDK: local-fixture')
    const providerFetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
        object: 'response',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: complete.output_text }] }],
    }))
    const { send } = await serve(t, {
        env: { ...liveEnv, AGICTO_API_KEY: agictoEnv.AGICTO_API_KEY, AGICTO_MODEL: 'agicto-only' },
        client: undefined,
    })
    const response = await send(valid, proxyHeaders)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).reply, complete.output_text)
    assert.equal(providerFetch.mock.callCount(), 1)
    const [endpoint, request] = providerFetch.mock.calls[0].arguments
    assert.match(new URL(endpoint).pathname, /\/responses$/)
    assert.equal(new Headers(request.headers).get('authorization'), `Bearer ${liveEnv.OPENAI_API_KEY}`)
    const body = JSON.parse(request.body)
    assert.equal(body.model, 'gpt-5.4-mini')
    assert.equal(body.max_output_tokens, 700)
    assert.equal(body.store, false)
    assert.deepEqual(body.input, [{ role: 'user', content: JSON.stringify(valid) }])
})

test('AGICTO errors, incomplete replies, and invalid content never reach the client', async t => {
    const sensitiveMessage = 'private-provider-credential-and-learner-data'
    const providerError = { error: { message: sensitiveMessage } }
    const providerReplies = [
        [Response.json(providerError, { status: 503 }), 'PROVIDER_UNAVAILABLE'],
        [Response.json(providerError), 'PROVIDER_INVALID_RESPONSE'],
        [Response.json({ choices: [] }), 'PROVIDER_INVALID_RESPONSE'],
        [Response.json({ choices: [{ finish_reason: 'length', message: { content: sensitiveMessage } }] }), 'PROVIDER_INVALID_RESPONSE'],
        [Response.json({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] }), 'PROVIDER_INVALID_RESPONSE'],
        [Response.json({ choices: [{ finish_reason: 'stop', message: { content: '字'.repeat(8001) } }] }), 'PROVIDER_INVALID_RESPONSE'],
    ]
    let nextReply
    const providerFetch = t.mock.method(globalThis, 'fetch', async () => nextReply)
    const { send, logs } = await serve(t, { env: agictoEnv })
    for (const [reply, code] of providerReplies) {
        nextReply = reply
        const response = await send(valid, proxyHeaders)
        assert.doesNotMatch(await response.clone().text(), /private-provider-credential-and-learner-data/)
        await errorCode(response, 502, code)
    }
    assert.equal(providerFetch.mock.callCount(), providerReplies.length)
    assert.doesNotMatch(JSON.stringify(logs), /private-provider-credential-and-learner-data|test-agicto-key|Explain/)
})

test('AGICTO shares the concurrency guard and aborts timed-out upstream work', async t => {
    const started = Promise.withResolvers()
    let pending = true
    const providerFetch = t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
        if (!pending)
            return Response.json(chatCompletion)
        started.resolve(signal)
        return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    })
    const { send } = await serve(t, {
        env: { ...agictoEnv, AI_TIMEOUT_MS: '500', ASSISTANT_MAX_CONCURRENT: '1' },
    })
    const first = send(valid, proxyHeaders)
    const signal = await started.promise
    await errorCode(await send(valid, proxyHeaders), 503, 'ASSISTANT_BUSY')
    await errorCode(await first, 504, 'PROVIDER_TIMEOUT')
    assert.equal(signal.aborted, true)
    pending = false
    assert.equal((await send(valid, proxyHeaders)).status, 200)
    assert.equal(providerFetch.mock.callCount(), 2)
})

test('provider failures never expose provider errors or silently return mock content', async t => {
    const { send, logs } = await serve(t, { env: liveEnv, create: async () => { throw new Error('secret-key learner-private-message') } })
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 502, 'PROVIDER_UNAVAILABLE')
    assert.equal(logs.length, 1)
    assert.deepEqual(Object.keys(logs[0]).sort(), ['code', 'event', 'requestId', 'status'])
    assert.doesNotMatch(JSON.stringify(logs), /secret-key|learner-private-message|Explain/)
})

test('empty or incomplete provider responses are rejected', async t => {
    let next = { status: 'completed', output_text: '' }
    const { send } = await serve(t, { env: liveEnv, create: async () => next })
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 502, 'PROVIDER_INVALID_RESPONSE')
    next = { status: 'incomplete', output_text: 'A partial sentence' }
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 502, 'PROVIDER_INVALID_RESPONSE')
})

test('the SDK timeout class is mapped to the same structured timeout response', async t => {
    const { send } = await serve(t, { env: liveEnv, create: async () => { throw new OpenAI.APIConnectionTimeoutError() } })
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 504, 'PROVIDER_TIMEOUT')
})

test('hard timeout aborts the provider and releases the concurrency slot', async t => {
    let signal
    let pending = true
    const { send } = await serve(t, {
        env: { ...liveEnv, AI_TIMEOUT_MS: '100', ASSISTANT_MAX_CONCURRENT: '1' },
        create: (_request, options) => {
            signal = options.signal
            return pending ? new Promise(() => {}) : Promise.resolve(complete)
        },
    })
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 504, 'PROVIDER_TIMEOUT')
    assert.equal(signal.aborted, true)
    pending = false
    assert.equal((await send(valid, { 'X-Assistant-Proxy-Token': secret })).status, 200)
})

test('provider concurrency is bounded independently of IP quotas', async t => {
    let resolveProvider
    let started
    const providerStarted = new Promise(resolve => { started = resolve })
    const { send } = await serve(t, {
        env: { ...liveEnv, ASSISTANT_MAX_CONCURRENT: '1' },
        create: () => new Promise(resolve => { resolveProvider = resolve; started() }),
    })
    const first = send(valid, { 'X-Assistant-Proxy-Token': secret })
    await providerStarted
    await errorCode(await send(valid, { 'X-Assistant-Proxy-Token': secret }), 503, 'ASSISTANT_BUSY')
    resolveProvider(complete)
    assert.equal((await first).status, 200)
})

test('client disconnect aborts upstream work and releases concurrency', async t => {
    let started
    let aborted
    let callCount = 0
    const providerStarted = new Promise(resolve => { started = resolve })
    const providerAborted = new Promise(resolve => { aborted = resolve })
    const { url, send } = await serve(t, {
        env: { ...liveEnv, ASSISTANT_MAX_CONCURRENT: '1' },
        create: (_request, { signal }) => {
            callCount += 1
            if (callCount > 1)
                return Promise.resolve(complete)
            signal.addEventListener('abort', aborted, { once: true })
            started()
            return new Promise(() => {})
        },
    })
    const request = http.request(`${url}/api/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Assistant-Proxy-Token': secret } })
    request.on('error', () => {})
    request.end(JSON.stringify(valid))
    await providerStarted
    request.destroy()
    await providerAborted
    assert.equal((await send(valid, { 'X-Assistant-Proxy-Token': secret })).status, 200)
})

test('untrusted forwarding headers cannot bypass IP quotas and expired quotas reset', async t => {
    let time = 1000
    const { send } = await serve(t, { env: { ASSISTANT_MODE: 'mock', ASSISTANT_RATE_LIMIT_PER_MINUTE: '1' }, now: () => time })
    assert.equal((await send(valid, { 'X-Forwarded-For': '198.51.100.1' })).status, 200)
    const limited = await send(valid, { 'X-Forwarded-For': '198.51.100.2' })
    assert.equal(limited.headers.get('retry-after'), '60')
    await errorCode(limited, 429, 'RATE_LIMITED')
    time += 60_000
    assert.equal((await send()).status, 200)
})

test('global minute and 24-hour provider caps apply across client IPs', async t => {
    let time = 1000
    const { send, calls } = await serve(t, {
        env: { ...liveEnv, TRUST_PROXY: '1', ASSISTANT_GLOBAL_RATE_LIMIT_PER_MINUTE: '1', ASSISTANT_DAILY_REQUEST_LIMIT: '2' },
        now: () => time,
    })
    const headers = ip => ({ 'X-Assistant-Proxy-Token': secret, 'X-Forwarded-For': ip })
    assert.equal((await send(valid, headers('198.51.100.1'))).status, 200)
    await errorCode(await send(valid, headers('198.51.100.2')), 429, 'GLOBAL_RATE_LIMITED')
    time += 60_000
    assert.equal((await send(valid, headers('198.51.100.2'))).status, 200)
    time += 60_000
    await errorCode(await send(valid, headers('198.51.100.3')), 429, 'DAILY_LIMIT_REACHED')
    assert.equal(calls.length, 2)
    time += 86_400_000
    assert.equal((await send(valid, headers('198.51.100.3'))).status, 200)
})

test('rate-limit storage has a fixed capacity, fails closed, and reclaims expired entries', () => {
    let time = 0
    const limiter = createRateLimiter({ limit: 1, maxKeys: 2, now: () => time })
    assert.equal(limiter.consume('a').allowed, true)
    assert.equal(limiter.consume('b').allowed, true)
    for (let i = 0; i < 1000; i++)
        assert.equal(limiter.consume(`new-${i}`).allowed, false)
    assert.equal(limiter.size, 2)
    assert.equal(limiter.consume('a').allowed, false)
    time = 60_000
    assert.equal(limiter.consume('c').allowed, true)
    assert.equal(limiter.size, 1)
})

test('unknown paths return structured 404 errors', async t => {
    const { url } = await serve(t)
    await errorCode(await fetch(`${url}/not-found`), 404, 'NOT_FOUND')
})

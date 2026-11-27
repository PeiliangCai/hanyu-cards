const DEFAULT_ORIGINS = 'http://localhost:3000,http://localhost:5173,capacitor://localhost,ionic://localhost'

function integer(env, name, fallback, min, max) {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new Error(`${name} must be an integer between ${min} and ${max}`)
    return value
}

export function readConfig(env = process.env) {
    const mode = env.ASSISTANT_MODE ?? (env.AI_MOCK === 'true' ? 'mock' : 'disabled')
    if (!['disabled', 'mock', 'openai', 'agicto'].includes(mode))
        throw new Error('ASSISTANT_MODE must be disabled, mock, openai, or agicto')
    const live = mode === 'openai' || mode === 'agicto'
    if (env.AI_MOCK !== undefined && !['true', 'false'].includes(env.AI_MOCK))
        throw new Error('AI_MOCK must be true or false')
    if (env.AI_MOCK === 'true' && live)
        throw new Error(`Remove AI_MOCK=true before enabling ${mode} mode`)

    const apiKeyName = mode === 'agicto' ? 'AGICTO_API_KEY' : 'OPENAI_API_KEY'
    const apiKey = live ? env[apiKeyName]?.trim() : undefined
    const proxySecret = env.ASSISTANT_PROXY_SECRET
    if (live) {
        if (!apiKey)
            throw new Error(`${apiKeyName} is required in ${mode} mode`)
        if (env.ASSISTANT_ACCESS_MODE !== 'trusted-proxy')
            throw new Error(`${mode === 'agicto' ? 'AGICTO' : 'OpenAI'} mode requires ASSISTANT_ACCESS_MODE=trusted-proxy and an authenticating gateway`)
        if (typeof proxySecret !== 'string' || proxySecret.length < 32 || proxySecret.length > 256 || !/^[\x21-\x7e]+$/.test(proxySecret))
            throw new Error('ASSISTANT_PROXY_SECRET must contain 32–256 non-whitespace ASCII characters; keep it only on the API and authenticating gateway')
    }

    const allowedOrigins = (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',').map(value => value.trim()).filter(Boolean)
    for (const origin of allowedOrigins) {
        let url
        try { url = new URL(origin) }
        catch { throw new Error('ALLOWED_ORIGINS must contain exact, valid origins') }
        if (!['http:', 'https:', 'capacitor:', 'ionic:'].includes(url.protocol)
            || !url.hostname || url.username || url.password || url.search || url.hash
            || (url.pathname !== '' && url.pathname !== '/') || origin.endsWith('/') || origin.includes('*'))
            throw new Error('ALLOWED_ORIGINS must contain exact origins without paths or wildcards')
    }

    return Object.freeze({
        mode,
        apiKey,
        proxySecret,
        allowedOrigins,
        model: mode === 'agicto'
            ? env.AGICTO_MODEL?.trim() || 'gpt-6-luna'
            : env.AI_MODEL?.trim() || 'gpt-5.4-mini',
        host: env.HOST || '127.0.0.1',
        port: integer(env, 'PORT', 8787, 1, 65535),
        trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 5),
        timeoutMs: integer(env, 'AI_TIMEOUT_MS', 20_000, 100, 60_000),
        rateLimit: integer(env, 'ASSISTANT_RATE_LIMIT_PER_MINUTE', 20, 1, 1000),
        maxRateLimitKeys: integer(env, 'ASSISTANT_MAX_RATE_LIMIT_KEYS', 10_000, 1, 100_000),
        globalRateLimit: integer(env, 'ASSISTANT_GLOBAL_RATE_LIMIT_PER_MINUTE', 60, 1, 10_000),
        dailyRequestLimit: integer(env, 'ASSISTANT_DAILY_REQUEST_LIMIT', 1000, 1, 1_000_000),
        maxConcurrent: integer(env, 'ASSISTANT_MAX_CONCURRENT', 4, 1, 100),
    })
}

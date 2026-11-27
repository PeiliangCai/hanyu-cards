import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

function fail(message) {
    console.error(`Mobile configuration check failed: ${message}`)
    process.exitCode = 1
}

// Only the public mobile configuration is inspected. The backend .env is never read.
const path = '.env.mobile.local'
if (existsSync(path)) {
    const contents = readFileSync(path, 'utf8')
    if (/^\s*(?:VITE_)?(?:OPENAI_API_KEY|AGICTO_API_KEY|ASSISTANT_PROXY_SECRET)\s*=/m.test(contents))
        fail('Remove server credentials from .env.mobile.local.')
    const line = contents.match(/^\s*VITE_ASSISTANT_API_URL\s*=\s*([^#\r\n]*)/m)
    const value = line?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
    if (value) {
        try {
            const url = new URL(value)
            if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname) || url.hostname.endsWith('.localhost'))
                fail('Online tutoring requires a public HTTPS gateway URL without embedded credentials.')
        }
        catch { fail('VITE_ASSISTANT_API_URL is not a valid URL.') }
    }
}
if (process.argv.includes('--android-release')) {
    const names = ['HANYU_UPLOAD_STORE_FILE', 'HANYU_UPLOAD_STORE_PASSWORD', 'HANYU_UPLOAD_KEY_ALIAS', 'HANYU_UPLOAD_KEY_PASSWORD']
    const missing = names.filter(name => !process.env[name])
    if (missing.length)
        fail(`Set the Android signing variables: ${missing.join(', ')}.`)
    else if (!existsSync(process.env.HANYU_UPLOAD_STORE_FILE))
        fail('The configured Android signing file does not exist.')
}
if (!process.exitCode)
    console.log('Mobile configuration checked. An empty assistant URL uses offline study notes; native builds still require the platform SDK and device testing.')

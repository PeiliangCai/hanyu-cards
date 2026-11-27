// Optional browser acceptance check. Install Playwright outside the app, then run:
// PLAYWRIGHT_MODULE_PATH=/tmp/hanyu-browser/node_modules/playwright node docker/browser-smoke.mjs
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { verifyBrowserLayout } from './browser-layout.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080'
const output = process.env.SMOKE_ARTIFACTS || '/tmp/hanyu-browser-artifacts'
await mkdir(output, { recursive: true })

const launchOptions = { channel: process.env.SMOKE_LOW_MEMORY === '1' ? undefined : 'chromium', headless: true, args: ['--no-sandbox', ...(process.env.SMOKE_LOW_MEMORY === '1' ? ['--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--in-process-gpu', '--no-zygote', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256'] : [])] }
let browser = await chromium.launch(launchOptions)
const errors = []
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(30_000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
})
let onlineRequests = 0
page.on('request', request => {
    if (request.url().includes('/api/assistant/chat')) onlineRequests += 1
})

try {
    // Finish first-install activation before navigating through the cached app.
    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).waitFor()
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some(registration => registration.active))
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    const routes = {
        study: /Build a little Mandarin/,
        practice: /Train every side/,
        scenarios: /Six missions/,
        dictionary: /Your pocket Mandarin/,
        progress: /Small steps become/,
        settings: /Learning preferences/,
        mistakes: /Turn every miss/,
    }
    for (const [route, heading] of Object.entries(routes)) {
        await page.goto(`${baseURL}/${route}`)
        await page.getByRole('heading', { name: heading, exact: true }).waitFor()
        assert.equal(await page.locator('main').count(), 1)
    }

    console.log('Browser acceptance: all seven routes loaded')
    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent?.startsWith('1/'))
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent?.startsWith('1/'))
    await page.screenshot({ path: join(output, 'desktop-study.png'), fullPage: true, scale: 'css' })

    await page.goto(`${baseURL}/settings`)
    await page.getByLabel('Daily review target', { exact: true }).fill('30')
    await page.getByRole('button', { name: 'Save Goal', exact: true }).click()
    await page.getByText('Daily review target saved.', { exact: true }).waitFor()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download Progress Backup', exact: true }).click()
    const download = await downloaded
    const backupPath = join(output, 'progress-backup.json')
    await download.saveAs(backupPath)
    const backup = JSON.parse(await readFile(backupPath, 'utf8'))
    assert.equal(backup.format, 'hanyu-cards-progress')
    assert.equal(backup.data.dailyGoal, 30)
    assert.equal(Object.keys(backup.data.records).length, 1)
    const plan = Object.values(backup.data.dailyPlans)[0]
    assert.equal(plan.goal, 24, 'A started route must stay fixed after changing tomorrow’s goal')
    assert.equal(plan.completedWordIds.length, 1)
    assert.equal(backup.preferences.onlineAssistantEnabled, undefined)
    assert.ok(backup.data.practiceStats)

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Reset Local Progress', exact: true }).click()
    await page.getByText('Local learning progress has been reset.', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '0/30')
    await page.locator('#progress-backup').setInputFiles(backupPath)
    await page.getByRole('heading', { name: 'Review before restoring', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Replace Local Progress', exact: true }).click()
    await page.getByText('Backup restored. Your learning progress and daily target are now saved on this device.', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Daily review target', { exact: true }).inputValue(), '30')
    await page.locator('#progress-backup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
    await page.locator('.backup-notice[role="alert"]').waitFor()
    assert.equal(await page.getByLabel('Daily review target', { exact: true }).inputValue(), '30')
    await page.screenshot({ path: join(output, 'settings-backup.png'), fullPage: true, scale: 'css' })
    console.log('Browser acceptance: saved review and backup recovery passed')

    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Open AI tutor', exact: true }).click()
    await page.getByLabel('Message to tutor', { exact: true }).fill('Give me a local study tip.')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Local study notes · nothing is sent online.', { exact: true }).waitFor()
    assert.equal(onlineRequests, 0, 'Default local notes must not send a tutor request')
    await page.getByText('Online AI & privacy', { exact: true }).click()
    await page.getByLabel('Enable online AI for this device', { exact: true }).check()
    await page.getByLabel('Message to tutor', { exact: true }).fill('Explain this Mandarin word.')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Demo tutor · a saved response, not a generated AI answer.', { exact: true }).waitFor()
    assert.equal(onlineRequests, 1)
    await page.getByRole('button', { name: 'Close AI tutor', exact: true }).click()
    console.log('Browser acceptance: local notes and opt-in mock tutoring passed')

    const apiPage = await context.newPage()
    apiPage.on('pageerror', error => errors.push(error.message))
    apiPage.on('console', message => {
        const expected404 = message.location().url === `${baseURL}/api/missing` && message.text().includes('404')
        if (message.type() === 'error' && !expected404) errors.push(message.text())
    })
    const missingAPI = await apiPage.goto(`${baseURL}/api/missing`)
    assert.equal(missingAPI.status(), 404, 'The active service worker must not replace API errors with the SPA')
    assert.match(missingAPI.headers()['content-type'], /application\/json/)
    assert.ok(await missingAPI.json())
    const health = await apiPage.goto(`${baseURL}/healthz`)
    assert.equal(health.status(), 200)
    assert.equal((await health.json()).service, 'hanyu-web', 'The service worker must not intercept health checks')
    await apiPage.close()
    await context.setOffline(true)
    await page.goto(`${baseURL}/dictionary`)
    await page.getByRole('heading', { name: /Your pocket Mandarin/, exact: true }).waitFor()
    const offlineBackground = await page.evaluate(async () => {
        const response = await fetch('/main-page-background.jpg', { cache: 'no-store' })
        return {
            status: response.status,
            contentType: response.headers.get('content-type'),
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
        }
    })
    assert.equal(offlineBackground.status, 200)
    assert.equal(offlineBackground.contentType, 'image/jpeg')
    const bundledBackground = await readFile(new URL('../public/main-page-background.jpg', import.meta.url))
    assert.ok(Buffer.from(offlineBackground.bytes).equals(bundledBackground), 'The offline background must match the bundled JPEG')
    await page.getByPlaceholder('Search hanzi, pinyin, or English', { exact: true }).fill('hello')
    assert.ok(await page.locator('.word-row').count() > 0, 'Offline dictionary should remain searchable')
    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '2/24')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '2/24')
    await context.setOffline(false)
    console.log('Browser acceptance: service worker isolation, offline background and offline persistence passed')

    // New daily-route and recovery behavior must survive full navigation and writes.
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Again/ }).click()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '3/24')
    await page.goto(`${baseURL}/mistakes`)
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.getByRole('heading', { name: 'No mistakes waiting for review.', exact: true }).waitFor()
    assert.equal(await page.locator('.topbar__meter strong').textContent(), '3/24', 'Recovery must not inflate the daily route')

    await page.goto(`${baseURL}/dictionary`)
    await page.getByRole('navigation', { name: 'Dictionary results pagination', exact: true }).getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByText(/Page 2 of/).waitFor()
    await page.getByPlaceholder('Search hanzi, pinyin, or English', { exact: true }).fill('爱')
    await page.locator('.word-row').first().click()
    await page.getByRole('link', { name: /Study this word/ }).click()
    await page.locator('.focused-study-strip').waitFor()
    assert.ok(new URL(page.url()).searchParams.get('word'), 'Dictionary focus must carry a word identifier')
    assert.equal(await page.locator('.word-card__hanzi').textContent(), '爱')
    await page.getByRole('button', { name: 'Reveal meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.locator('.focused-study-complete').waitFor()
    assert.equal(await page.locator('.topbar__meter strong').textContent(), '3/24')

    await page.goto(`${baseURL}/practice`)
    await page.getByRole('button', { name: /Hanzi recall/ }).click()
    for (let index = 0; index < 10; index++) {
        await page.locator('.quiz-options button').first().click()
        await page.getByRole('button', { name: 'Check Answer', exact: true }).click()
        await page.getByRole('button', { name: index === 9 ? 'View round summary' : 'Next Question', exact: true }).click()
    }
    await page.getByRole('heading', { name: /correct ·/ }).waitFor()
    assert.equal(await page.locator('.topbar__meter strong').textContent(), '3/24')

    await page.goto(`${baseURL}/scenarios`)
    await page.locator('.scenario-task textarea').fill('我叫安娜，我是英国人，我学习汉语。')
    await page.locator('.scenario-task > .primary-action').click()
    await page.locator('.task-feedback--complete').waitFor()
    assert.match(await page.locator('.task-feedback__source').textContent(), /grammar and fluency are not assessed/)
    assert.equal(onlineRequests, 1, 'Mission checking must not send another online tutor request')
    await page.reload()
    assert.match(await page.locator('.scenario-summary').textContent(), /1\/6/)
    await context.close()
    await browser.close()
    console.log('Browser acceptance: recovery, focused study, practice and local missions passed')

    for (const [width, height] of [[320, 640], [360, 740], [390, 844], [740, 360], [1280, 844]]) {
        browser = await chromium.launch(launchOptions)
        await verifyBrowserLayout(browser, { baseURL, output, errors, routes, width, height })
        await browser.close()
        console.log(`Browser acceptance: controls and content fit ${width}×${height}`)
    }

    assert.deepEqual(errors, [], 'Browser errors or CSP violations were recorded')
    console.log(`Browser smoke passed: seven routes, fixed daily plans, mistake recovery, focused study, pagination, ten-question practice, local mission checks, backup export/reset/restore, invalid import, AI consent/mock, offline reload/search/reviews, mobile and desktop layouts, WebView-compatible media queries. Artifacts: ${output}`)
}
finally {
    await browser.close()
}

// Optional browser acceptance check. Install Playwright outside the app, then run:
// PLAYWRIGHT_MODULE_PATH=/tmp/hanyu-browser/node_modules/playwright node docker/browser-smoke.mjs
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080'
const output = process.env.SMOKE_ARTIFACTS || '/tmp/hanyu-browser-artifacts'
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox'] })
const errors = []
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(15_000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
})
let onlineRequests = 0
page.on('request', request => {
    if (request.url().includes('/api/assistant/chat')) onlineRequests += 1
})

try {
    const routes = {
        study: "Learn today's Mandarin words",
        practice: 'Match the meaning',
        scenarios: 'Real-life missions',
        dictionary: 'Chinese dictionary',
        progress: 'Your progress',
        settings: 'Learning preferences',
    }
    for (const [route, heading] of Object.entries(routes)) {
        await page.goto(`${baseURL}/${route}`)
        await page.getByRole('heading', { name: heading, exact: true }).waitFor()
        assert.equal(await page.locator('main').count(), 1)
    }

    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Reveal Meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent?.startsWith('1/'))
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent?.startsWith('1/'))
    await page.screenshot({ path: join(output, 'desktop-study.png'), fullPage: true })

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
    await page.screenshot({ path: join(output, 'settings-backup.png'), fullPage: true })

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

    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some(registration => registration.active))
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
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
    await page.getByRole('heading', { name: 'Chinese dictionary', exact: true }).waitFor()
    await page.getByPlaceholder('hanzi, pinyin, or English', { exact: true }).fill('hello')
    assert.ok(await page.locator('.word-row').count() > 0, 'Offline dictionary should remain searchable')
    await page.goto(`${baseURL}/study`)
    await page.getByRole('button', { name: 'Reveal Meaning', exact: true }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '2/30')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.topbar__meter strong')?.textContent === '2/30')
    await context.setOffline(false)

    for (const width of [320, 390, 1280]) {
        const mobile = await browser.newContext({ ...devices['iPhone 13'], viewport: { width, height: 844 } })
        const phone = await mobile.newPage()
        phone.on('pageerror', error => errors.push(error.message))
        await phone.goto(`${baseURL}/study`)
        await phone.getByRole('button', { name: 'Reveal Meaning', exact: true }).waitFor()
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${width}px viewport should not overflow horizontally`)
        await phone.screenshot({ path: join(output, `study-${width}.png`), fullPage: true })
        await phone.getByRole('button', { name: 'Open AI tutor', exact: true }).click()
        const bounds = await phone.locator('.assistant__panel').boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844, `${width}px tutor panel must fit inside the viewport`)
        await phone.screenshot({ path: join(output, `tutor-${width}.png`), fullPage: true })
        await mobile.close()
    }

    assert.deepEqual(errors, [], 'Browser errors or CSP violations were recorded')
    console.log(`Browser smoke passed: six routes, saved reviews, backup export/reset/restore, invalid import, AI consent/mock, offline reload/search/reviews, 320/390/1280px layouts. Artifacts: ${output}`)
}
finally {
    await browser.close()
}

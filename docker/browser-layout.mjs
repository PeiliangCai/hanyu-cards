import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function verifyCompatibleMediaQueries(page) {
    const ranges = await page.evaluate(() => {
        const incompatible = []
        function inspect(rules, url) {
            for (const rule of rules) {
                if (rule instanceof CSSMediaRule && /[<>]/.test(rule.conditionText))
                    incompatible.push(`${url}: ${rule.conditionText}`)
                if (rule.cssRules)
                    inspect(rule.cssRules, url)
            }
        }
        for (const sheet of document.styleSheets) {
            if (sheet.href && new URL(sheet.href).origin === location.origin)
                inspect(sheet.cssRules, new URL(sheet.href).pathname)
        }

        return incompatible
    })
    assert.deepEqual(ranges, [], 'Compiled stylesheets must use media queries understood by Android WebViews before Chromium 104')
}

const layoutContent = [
    '.topbar a', '.bottom-nav a', '.assistant__bubble',
    'main :is(a, button, input, select, textarea, summary, label, h2, h3, [tabindex="0"])',
    '.study-plan-ring', '.deck-status > div', '.deck-status small', '.deck-status strong',
    '.word-card__hanzi', '.word-card__pinyin', '.review-button > *',
    '.word-row p', '.word-row__word > *', '.dictionary-detail__character strong',
    '.stats-grid article', '.stats-grid article p', '.weekly-chart > div', '.weekly-chart > div > :is(span, small, em)',
].join(', ')

async function verifyHorizontalLayout(page, width, description) {
    const clipped = await page.locator(layoutContent).evaluateAll((elements, viewportWidth) => {
        function findClip(parent, rect) {
            let { left, right } = rect
            for (; parent; parent = parent.parentElement) {
                const overflow = getComputedStyle(parent).overflowX
                if (overflow === 'visible')
                    continue

                const start = parent.getBoundingClientRect().left + parent.clientLeft
                const end = start + parent.clientWidth
                // These two strips deliberately expose offscreen choices via horizontal scrolling.
                if (parent.matches('.practice-mode-picker, .scenario-list') && /^(auto|scroll)$/.test(overflow)) {
                    const offset = left < start
                        ? Math.max(left - start, -parent.scrollLeft)
                        : Math.min(Math.max(0, right - end), parent.scrollWidth - parent.clientWidth - parent.scrollLeft)
                    left -= offset
                    right -= offset
                }
                if (left < start - 1 || right > end + 1)
                    return `${parent.className || parent.tagName} (overflow-x: ${overflow})`
            }
            if (left < -1 || right > viewportWidth + 1)
                return 'viewport'

            return ''
        }

        const issues = []
        for (const element of elements) {
            const box = element.getBoundingClientRect()
            if (!box.width || !box.height || getComputedStyle(element).visibility !== 'visible')
                continue

            const name = element.getAttribute('aria-label') || element.innerText.trim().replace(/\s+/g, ' ').slice(0, 72) || element.id || element.tagName
            const textBoxes = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).flatMap(node => {
                const range = new Range()
                range.selectNodeContents(node)

                return [...range.getClientRects()]
            })
            for (const rect of [box, ...textBoxes]) {
                const clip = findClip(rect === box ? element.parentElement : element, rect)
                if (clip) {
                    issues.push(`${name} (${Math.round(rect.left)}–${Math.round(rect.right)} px) clipped by ${clip}`)
                    break
                }
            }
        }

        return issues.slice(0, 10)
    }, width)
    assert.deepEqual(clipped, [], `${description} controls and labels must fit horizontally`)
}

async function onScreen(locator, label, fraction = 0.5) {
    const target = await locator.evaluate((element, offset) => {
        const rect = element.getBoundingClientRect()
        const { offsetLeft, offsetTop, width, height } = visualViewport
        const x = rect.left + rect.width * offset
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        const outside = rect.width === 0 || rect.height === 0 || rect.left < offsetLeft - 1 || rect.right > offsetLeft + width + 1
            || rect.top < offsetTop - 1 || rect.bottom > offsetTop + height + 1
        let clippedBy = ''
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const { overflowX, overflowY } = getComputedStyle(parent)
            if (overflowX === 'visible' && overflowY === 'visible')
                continue

            const bounds = parent.getBoundingClientRect()
            const left = bounds.left + parent.clientLeft
            const top = bounds.top + parent.clientTop
            if ((overflowX !== 'visible' && (rect.left < left - 1 || rect.right > left + parent.clientWidth + 1))
                || (overflowY !== 'visible' && (rect.top < top - 1 || rect.bottom > top + parent.clientHeight + 1))) {
                clippedBy = parent.className || parent.tagName
                break
            }
        }

        return {
            x, y, outside, clippedBy, box: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round),
            obstruction: hit && element.contains(hit) ? '' : hit?.closest('button, a')?.getAttribute('aria-label') || hit?.localName || 'outside the viewport',
        }
    }, fraction)
    assert.ok(!target.outside && !target.clippedBy && !target.obstruction, `${label} must be visible and hittable (${JSON.stringify(target)})`)

    return target
}

async function tap(page, locator, label, { center = false, fraction = 0.5 } = {}) {
    await locator.waitFor()
    if (center)
        await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    const { x, y } = await onScreen(locator, label, fraction)
    await page.touchscreen.tap(x, y)
}

async function verifyStudyCard(page) {
    const reveal = page.getByRole('button', { name: 'Reveal meaning', exact: true })
    const jump = page.getByRole('link', { name: 'Study today’s cards', exact: true })
    const canJump = await jump.isVisible()
    await tap(page, canJump ? jump : reveal, 'First-viewport Today action')
    if (canJump) {
        assert.ok(await page.locator('.word-card').evaluate(element => element === document.activeElement), 'Opening Today’s card must move focus to it')
        await onScreen(page.locator('.word-card__hanzi'), 'Today’s word after opening the card')
        await tap(page, reveal, 'Reveal meaning after opening the card')
    }
    await page.locator('.word-card__meaning p').waitFor()
}

async function verifyTomorrowLink(page, baseURL, output) {
    const change = page.getByRole('link', { name: 'Change tomorrow', exact: true })
    await change.waitFor()
    await change.evaluate(element => {
        const link = element.getBoundingClientRect()
        const navTop = document.querySelector('.bottom-nav').getBoundingClientRect().top
        window.scrollBy(0, Math.max(0, link.top + link.height / 2 - navTop + 32))
    })
    await page.screenshot({ path: join(output, 'today-settings-link-360.png'), scale: 'css' })
    await tap(page, change, 'Right side of Change tomorrow beside the tutor', { fraction: 0.9 })
    await page.waitForURL('**/settings')
    await page.goto(`${baseURL}/study`)
}

async function verifyDictionaryReview(page, baseURL, width, output) {
    await page.goto(`${baseURL}/dictionary`)
    const search = page.getByRole('searchbox', { name: 'Search dictionary' })
    await tap(page, search, 'Dictionary search', { center: true })
    assert.ok(await search.evaluate(element => element === document.activeElement), 'Tapping dictionary search must focus it')
    await search.fill('爱')
    await tap(page, page.locator('.word-row').first(), 'Matching dictionary word', { center: true })
    await tap(page, page.getByRole('link', { name: /Study this word/ }), 'Study this word', { center: true })
    assert.equal(await page.locator('.word-card__hanzi').textContent(), '爱')
    await tap(page, page.getByRole('button', { name: 'Reveal meaning', exact: true }), 'Reveal selected word', { center: true })
    await page.locator('.word-card__meaning p').waitFor()
    await verifyHorizontalLayout(page, width, `Focused review at ${width}px`)
    const good = page.getByRole('button', { name: /^Good/ })
    await good.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.screenshot({ path: join(output, `focused-review-${width}.png`), scale: 'css' })
    await tap(page, good, 'Good review rating')
    await page.getByText('Focused review saved', { exact: true }).waitFor()
    await verifyHorizontalLayout(page, width, `Saved review at ${width}px`)
}

async function verifyTutor(page, width, height, output) {
    const open = page.getByRole('button', { name: 'Open AI tutor', exact: true })
    await tap(page, open, 'Open AI tutor')
    await tap(page, page.getByText('Online AI & privacy', { exact: true }), 'Online AI & privacy')
    await onScreen(page.getByRole('region', { name: 'AI tutor' }), 'Tutor panel')
    const input = page.getByRole('textbox', { name: 'Message to tutor' })
    if (height === 360) {
        await tap(page, input, 'Tutor composer in landscape')
        // Resize the visible area after focus, as the Android keyboard does.
        await page.setViewportSize({ width, height: 250 })
        await page.screenshot({ path: join(output, 'tutor-landscape-resized.png'), scale: 'css' })
    }
    await page.screenshot({ path: join(output, `tutor-${width}.png`), scale: 'css' })
    await tap(page, input, 'Tutor composer with privacy expanded')
    assert.ok(await input.evaluate(element => element === document.activeElement), 'Tapping the tutor composer must focus it')
    await page.keyboard.type('Give me a local study tip.')
    await tap(page, page.getByRole('button', { name: 'Send message', exact: true }), 'Send tutor message')
    await page.getByText('Local study notes · nothing is sent online.', { exact: true }).waitFor()
    await tap(page, page.getByRole('button', { name: 'Close AI tutor', exact: true }), 'Close AI tutor after sending')
    assert.ok(await open.evaluate(element => element === document.activeElement), 'Closing the tutor must return focus to its button')
}

export async function verifyBrowserLayout(browser, { baseURL, output, errors, routes, width, height }) {
    const mobile = width < 1000
    const context = await browser.newContext({
        viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', serviceWorkers: 'block',
    })
    try {
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        page.setDefaultTimeout(30_000)
        for (const [route, heading] of Object.entries(routes)) {
            await page.goto(`${baseURL}/${route}`)
            await page.getByRole('heading', { name: heading }).waitFor()
            if (!mobile)
                await verifyCompatibleMediaQueries(page)
            if (route === 'study') {
                const reveal = page.getByRole('button', { name: 'Reveal meaning', exact: true })
                await reveal.waitFor()
                await page.screenshot({ path: join(output, `study-${width}.png`), scale: 'css' })
                if (width < 500 || !mobile)
                    assert.equal(await page.locator('.study-plan-ring').isVisible(), !mobile, 'Today’s progress ring must follow the viewport layout')
                if (width === 360 || height === 360)
                    await verifyStudyCard(page)
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} must fit a ${width}px viewport`)
            await verifyHorizontalLayout(page, width, `${route} at ${width}×${height}`)
            if (route === 'progress') {
                const chart = page.locator('.weekly-chart')
                assert.equal(await chart.locator('> div > small').count(), 7, 'Progress must show all seven days')
                await chart.evaluate(element => element.scrollIntoView({ block: 'center' }))
                await page.screenshot({ path: join(output, `progress-chart-${width}.png`), scale: 'css' })
                await onScreen(chart, 'Weekly progress chart after scrolling')
            }
        }

        if (width === 320 || height === 360)
            await verifyDictionaryReview(page, baseURL, width, output)
        await page.goto(`${baseURL}/study`)
        const reveal = page.getByRole('button', { name: 'Reveal meaning', exact: true })
        await reveal.waitFor()
        if (width === 360)
            await verifyTomorrowLink(page, baseURL, output)
        if (mobile)
            await verifyTutor(page, width, height, output)
    }
    finally {
        await context.close()
    }
}

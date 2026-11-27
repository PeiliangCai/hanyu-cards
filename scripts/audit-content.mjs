import { readFile } from 'node:fs/promises'

// This script reports review candidates only. It never rewrites teaching data.
const words = JSON.parse(await readFile(new URL('../src/data/hskWords.json', import.meta.url), 'utf8'))
const polyphonicReview = new Set(['几', '行', '得', '长', '还', '了', '好', '会', '重', '乐', '觉', '便', '只', '着'])
const findings = []
const meanings = new Map()
for (const word of words) {
    const reasons = []
    if (/^surname\b/i.test(word.english.trim()))
        reasons.push('surname_first_definition')
    if (polyphonicReview.has(word.simplified))
        reasons.push('polyphonic_or_particle_review')
    if (reasons.length)
        findings.push({ id: word.id, level: word.level, simplified: word.simplified, pinyin: word.pinyin, english: word.english, reasons })
    const key = word.english.trim().replace(/\s+/g, ' ').toLowerCase()
    const ids = meanings.get(key) ?? []
    ids.push(word.id)
    meanings.set(key, ids)
}

if (process.argv.includes('--csv')) {
    const escape = value => `"${String(value).replaceAll('"', '""')}"`
    console.log(['id', 'level', 'simplified', 'pinyin', 'english', 'review_reasons', 'review_status', 'review_notes'].join(','))
    for (const item of findings)
        console.log([item.id, item.level, item.simplified, item.pinyin, item.english, item.reasons.join(';'), 'pending', ''].map(escape).join(','))
}
else {
    console.log(JSON.stringify({
        totalEntries: words.length,
        byLevel: Object.fromEntries([1, 2, 3].map(level => [level, words.filter(word => word.level === level).length])),
        surnameFirstDefinitions: findings.filter(item => item.reasons.includes('surname_first_definition')).length,
        manualPolyphonicCandidates: findings.filter(item => item.reasons.includes('polyphonic_or_particle_review')).length,
        entriesForReview: findings.length,
        duplicateMeaningGroups: [...meanings].filter(([, ids]) => ids.length > 1).map(([english, ids]) => ({ english, ids })),
        findings,
    }, null, 2))
}

import {
    describe,
    expect,
    it,
} from 'vitest'
import type { HskWord } from '@/types/learning'
import { chooseQuizOptions } from '@/utils/learning'
import words from '@/data/hskWords.json'

const word = (id: string, english: string): HskWord => ({ ...words[0], id, english, level: 1 })
const label = (item: HskWord) => item.english.trim().replace(/\s+/g, ' ').toLowerCase()

describe('meaning quiz answer choices', () => {
    it('always includes the actual answer exactly once and deduplicates visible meanings', () => {
        const current = word('older-sister', 'older sister')
        const pool = [current, word('duplicate', 'Older   sister'), word('hello', 'hello'), word('hello-again', 'HELLO'), word('tea', 'tea'), word('water', 'water'), word('rice', 'rice')]
        const originalOrder = [...pool]
        for (let iteration = 0; iteration < 30; iteration++) {
            const options = chooseQuizOptions(current, pool)
            expect(options).toHaveLength(4)
            expect(options.filter(item => item.id === current.id)).toEqual([current])
            expect(new Set(options.map(label)).size).toBe(options.length)
        }
        expect(pool).toEqual(originalOrder)
    })

    it('uses fewer options when the filtered pool has too few distinct meanings', () => {
        const current = word('hear', 'to hear')
        const options = chooseQuizOptions(current, [current, word('also-hear', 'to hear'), word('see', 'to see')])
        expect(options).toHaveLength(2)
        expect(new Set(options.map(label))).toEqual(new Set(['to hear', 'to see']))
        expect(chooseQuizOptions(current, [])).toEqual([current])
    })

    it('does not make two identical dictionary translations competing correct answers', () => {
        const current = words.find(item => item.simplified === '姐姐') as HskWord
        const sameMeaning = words.filter(item => item.english === current.english) as HskWord[]
        expect(sameMeaning.length).toBeGreaterThan(1)
        expect(chooseQuizOptions(current, sameMeaning)).toEqual([current])
    })
})

import { describe, expect, it, vi } from 'vitest'
import { todayKey } from '@/utils/learning'

describe('local study day', () => {
    it('uses the device calendar date across a UTC day boundary', () => {
        const date = new Date('2026-09-21T23:30:00Z')
        vi.spyOn(date, 'getFullYear').mockReturnValue(2026)
        vi.spyOn(date, 'getMonth').mockReturnValue(8)
        vi.spyOn(date, 'getDate').mockReturnValue(22)
        expect(todayKey(date)).toBe('2026-09-22')
    })
})

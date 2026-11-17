import { describe, it, expect } from 'vitest'
import { streaks } from '../lib/streak'

const rows = (s: string, today = '2026-10-23') => s.split('').map((c, i) => ({ date: `d${i}`, ok: c === 'Y' })).map((r, i) => (i === 0 ? { ...r, date: today } : r))
describe('streaks (newest first)', () => {
  it('counts consecutive verified sessions', () => { expect(streaks(rows('YYYN', 'x'), 'y')).toEqual({ current: 3, longest: 3 }) })
  it('breaks at the first miss', () => { expect(streaks(rows('NYYY', 'x'), 'y').current).toBe(0) })
  it('finds a longer streak earlier in the history', () => { expect(streaks(rows('YNYYYYN', 'x'), 'y')).toEqual({ current: 1, longest: 4 }) })
  it('does not hold an open session today against the student', () => { expect(streaks(rows('NYYY'), '2026-10-23').current).toBe(3) })
  it('counts today once it is verified', () => { expect(streaks(rows('YYY'), '2026-10-23').current).toBe(3) })
  it('handles no sessions', () => { expect(streaks([], 'z')).toEqual({ current: 0, longest: 0 }) })
})

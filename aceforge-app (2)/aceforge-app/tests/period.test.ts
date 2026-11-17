import { describe, it, expect } from 'vitest'
import { addDays, dayDiff, range, pct, pctText, isDate } from '../lib/period'

describe('dates', () => {
  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('counts days between dates', () => { expect(dayDiff('2026-10-01', '2026-10-15')).toBe(14) })
  it('validates date strings', () => { expect(isDate('2026-10-23')).toBe(true); expect(isDate('23/10/2026')).toBe(false); expect(isDate(undefined)).toBe(false) })
})
describe('range', () => {
  it('defaults to the 30 days ending on "to"', () => { expect(range({ to: '2026-10-30' })).toEqual({ from: '2026-10-01', to: '2026-10-30' }) })
  it('keeps a valid range', () => { expect(range({ from: '2026-09-01', to: '2026-09-10' })).toEqual({ from: '2026-09-01', to: '2026-09-10' }) })
  it('swaps a reversed range', () => { expect(range({ from: '2026-09-10', to: '2026-09-01' })).toEqual({ from: '2026-09-01', to: '2026-09-10' }) })
  it('ignores junk input', () => { expect(range({ from: 'x', to: '2026-10-30' }).from).toBe('2026-10-01') })
})
describe('percentages', () => {
  it('rounds', () => { expect(pct(1, 3)).toBe(33); expect(pctText(2, 3)).toBe('67%') })
  it('never divides by zero', () => { expect(pct(0, 0)).toBeNull(); expect(pctText(5, 0)).toBe('–') })
})

import { describe, it, expect } from 'vitest'
import { csvCell, toCsv } from '../lib/csv'

describe('csvCell', () => {
  it('quotes and escapes quotes', () => { expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"') })
  it('keeps newlines inside quotes', () => { expect(csvCell('a\nb')).toBe('"a\nb"') })
  it('turns null and undefined into empty cells', () => { expect(csvCell(null)).toBe('""'); expect(csvCell(undefined)).toBe('""') })
  it('blocks spreadsheet formulas in text', () => {
    for (const s of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx']) expect(csvCell(s).startsWith(`"'`)).toBe(true)
  })
  it('does not corrupt negative numbers such as deducted points', () => { expect(csvCell(-10)).toBe('"-10"') })
})
describe('toCsv', () => {
  it('adds a BOM and uses CRLF', () => {
    const out = toCsv(['a', 'b'], [[1, 'x'], [2, 'y']])
    expect(out.startsWith('\ufeff')).toBe(true)
    expect(out.split('\r\n')).toHaveLength(3)
  })
})

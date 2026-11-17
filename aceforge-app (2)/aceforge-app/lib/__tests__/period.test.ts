import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayDiff, isDate, range, pct, pctText } from '../period.ts'

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
})
test('dayDiff counts whole days', () => { assert.equal(dayDiff('2026-10-01', '2026-10-15'), 14); assert.equal(dayDiff('2026-10-15', '2026-10-15'), 0) })
test('isDate accepts real dates only', () => {
  assert.ok(isDate('2026-10-23')); assert.ok(!isDate('2026-13-40')); assert.ok(!isDate('23/10/2026')); assert.ok(!isDate(undefined)); assert.ok(!isDate(''))
})
test('range defaults to the last 30 days ending today', () => { assert.deepEqual(range({}, '2026-10-23'), { from: '2026-09-24', to: '2026-10-23' }) })
test('range keeps valid input and fixes reversed dates', () => {
  assert.deepEqual(range({ from: '2026-10-01', to: '2026-10-10' }, '2026-10-23'), { from: '2026-10-01', to: '2026-10-10' })
  assert.deepEqual(range({ from: '2026-10-10', to: '2026-10-01' }, '2026-10-23'), { from: '2026-10-01', to: '2026-10-10' })
})
test('range ignores garbage input', () => { assert.deepEqual(range({ from: 'x', to: "1' or 1=1" }, '2026-10-23'), { from: '2026-09-24', to: '2026-10-23' }) })
test('pct rounds and handles zero denominators', () => {
  assert.equal(pct(1, 3), 33); assert.equal(pct(2, 3), 67); assert.equal(pct(0, 0), null)
  assert.equal(pctText(3, 4), '75%'); assert.equal(pctText(0, 0), '–')
})

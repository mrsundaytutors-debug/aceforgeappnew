import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv } from '../csv.ts'

test('quotes and escapes embedded quotes', () => { assert.equal(csvCell('say "hi"'), '"say ""hi"""') })
test('null and undefined become empty cells', () => { assert.equal(csvCell(null), '""'); assert.equal(csvCell(undefined), '""') })
test('numbers stay intact, including negative deductions', () => { assert.equal(csvCell(15), '"15"'); assert.equal(csvCell(-5), '"-5"') })
test('text that looks like a negative number is still neutralised', () => { assert.equal(csvCell('-5'), `"'-5"`) })
test('formula starters are neutralised', () => {
  for (const f of ['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx']) assert.ok(csvCell(f).startsWith(`"'`), f)
})
test('commas and newlines stay inside the quoted cell', () => { assert.equal(csvCell('a,b\nc'), '"a,b\nc"') })
test('toCsv adds a BOM, a header and CRLF row breaks', () => {
  const out = toCsv(['Name', 'Points'], [['Ada', 10], ['Tunde', 5]])
  assert.equal(out, '\ufeff"Name","Points"\r\n"Ada","10"\r\n"Tunde","5"')
})
test('non-ASCII names survive', () => { assert.ok(toCsv(['n'], [['Chiọma Ezé']]).includes('Chiọma Ezé')) })

/** Quote one CSV cell and neutralise spreadsheet formulas (=, +, -, @). */
export function csvCell(v: unknown): string {
  if (typeof v === 'number') return `"${v}"`      // numbers (including negative deductions) are data, never formulas
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}
/** Header + rows as CSV text, with a BOM so Excel reads UTF-8 names correctly. */
export function toCsv(head: string[], rows: unknown[][]): string {
  return '\ufeff' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

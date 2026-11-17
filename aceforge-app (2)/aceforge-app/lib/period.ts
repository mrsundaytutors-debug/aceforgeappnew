const lagosToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())

export const isDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
export function addDays(d: string, n: number) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
export function dayDiff(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) }
/** Report range: defaults to the last 30 days ending today (Lagos). Swaps reversed dates and ignores invalid ones. */
export function range(sp: { from?: string; to?: string }, today: string = lagosToday()) {
  const to = isDate(sp.to) ? sp.to! : today
  const from = isDate(sp.from) ? sp.from! : addDays(to, -29)
  return from <= to ? { from, to } : { from: to, to: from }
}
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
export const pctText = (a: number, b: number) => { const p = pct(a, b); return p == null ? '–' : `${p}%` }

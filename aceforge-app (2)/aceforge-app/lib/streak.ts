export type SessionRow = { date: string; ok: boolean }
/** rows are newest first. An open session today with no verified check-in is not held against the student. */
export function streaks(rows: SessionRow[], today: string) {
  const it = rows.slice()
  if (it[0] && it[0].date === today && !it[0].ok) it.shift()
  let current = 0
  for (const x of it) { if (x.ok) current++; else break }
  let longest = 0, run = 0
  for (const x of rows.slice().reverse()) { run = x.ok ? run + 1 : 0; longest = Math.max(longest, run) }
  return { current, longest }
}

import Link from 'next/link'

export const METRICS: [string, string][] = [['points', 'Points earned'], ['attendance', 'Attendance days'], ['punctual', 'Punctual arrivals'], ['tasks', 'Tasks completed']]
export const PERIODS: [string, string][] = [['week', 'This week'], ['month', 'This month'], ['all', 'All time']]

export function Tabs({ base, params, name, options }: { base: string; params: Record<string, string>; name: string; options: [string, string][] }) {
  return <div className="mb-2 flex flex-wrap gap-2">{options.map(([v, l]) => {
    const q = new URLSearchParams({ ...params, [name]: v }).toString()
    return <Link key={v} href={`${base}?${q}`} className={params[name] === v ? 'btn !min-h-[40px]' : 'btn-sec !min-h-[40px]'}>{l}</Link>
  })}</div>
}

export async function Board({ sb, classId, metric, from, to, limit }: { sb: any; classId: string; metric: string; from: string; to: string; limit?: number }) {
  const { data, error } = await sb.rpc('leaderboard', { p_class: classId, p_from: from, p_to: to, p_metric: metric })
  if (error) return <div className="card text-slate-600">{error.message === 'Not allowed' ? 'Leaderboards are not available for this class.' : error.message}</div>
  const rows: { pos: number; display_name: string; score: number; is_me: boolean }[] = data ?? []
  if (!rows.length) return <div className="card text-slate-600">No activity in this period yet.</div>
  const shown = limit ? rows.filter((r, i) => i < limit || r.is_me) : rows
  return <div className="card">{shown.map((r, i) => (
    <div key={i} className={`flex justify-between border-b py-2 last:border-0 ${r.is_me ? 'font-bold' : ''}`}>
      <span>#{r.pos} {r.display_name}{r.is_me ? ' (you)' : ''}</span><span>{Number(r.score)}</span></div>))}
    <p className="mt-2 text-xs text-slate-500">Compared within one class only. Scores are counts of verified activity, not raw exam marks.</p></div>
}

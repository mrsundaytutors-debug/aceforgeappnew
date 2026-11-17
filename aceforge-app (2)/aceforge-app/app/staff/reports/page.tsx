import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { range, addDays, dayDiff, pct, pctText } from '@/lib/period'
import { AttendanceTrend, PointsChart } from '@/components/Charts'
import { PrintButton } from '@/components/PrintButton'

type Att = { id: string; full_name: string; class_name: string; sessions: number; present: number; punctual: number; late: number; excused: number }
type Tk = { id: string; full_name: string; class_name: string; assigned: number; submitted: number; approved: number; rejected: number; avg_pct: number | null }
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0)

export default async function Reports({ searchParams }: { searchParams: { from?: string; to?: string; class?: string } }) {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const { from, to } = range(searchParams)
  let classes: { id: string; name: string }[] = []
  if (profile.role === 'admin') classes = (await sb.from('classes').select('id,name').order('name')).data ?? []
  else classes = ((await sb.from('tutor_classes').select('classes(id,name)').eq('tutor_id', profile.id)).data ?? []).map((r: any) => r.classes)
  const cls = classes.find((c) => c.id === searchParams.class)?.id ?? null

  const call = (f: string, t: string) => sb.rpc('report_data', { p_from: f, p_to: t, p_class: cls })
  const days = dayDiff(from, to)
  const mid = addDays(from, Math.floor(days / 2))
  const [main, h1, h2] = await Promise.all([call(from, to), days >= 13 ? call(from, mid) : null, days >= 13 ? call(addDays(mid, 1), to) : null])
  if (main.error) return <div className="card text-red-700" role="alert">Could not load the report: {main.error.message}</div>
  const d = main.data as { attendance: Att[]; tasks: Tk[]; daily: any[]; points: any[]; redemptions: { status: string; n: number }[] }

  const sessions = sum(d.attendance, (a) => a.sessions), present = sum(d.attendance, (a) => a.present), punctual = sum(d.attendance, (a) => a.punctual)
  const assigned = sum(d.tasks, (t) => t.assigned), submitted = sum(d.tasks, (t) => t.submitted), approved = sum(d.tasks, (t) => t.approved), rejected = sum(d.tasks, (t) => t.rejected)
  const scored = d.tasks.filter((t) => t.avg_pct != null)
  const avgScore = scored.length ? Math.round(sum(scored, (t) => Number(t.avg_pct)) / scored.length) : null

  const byClass = new Map<string, { s: number; p: number; pu: number; a: number; sub: number }>()
  d.attendance.forEach((a) => { const c = byClass.get(a.class_name) ?? { s: 0, p: 0, pu: 0, a: 0, sub: 0 }; c.s += a.sessions; c.p += a.present; c.pu += a.punctual; byClass.set(a.class_name, c) })
  d.tasks.forEach((t) => { const c = byClass.get(t.class_name) ?? { s: 0, p: 0, pu: 0, a: 0, sub: 0 }; c.a += t.assigned; c.sub += t.submitted; byClass.set(t.class_name, c) })

  const missers = [...d.tasks].map((t) => ({ ...t, missed: t.assigned - t.submitted })).filter((t) => t.missed > 0).sort((a, b) => b.missed - a.missed).slice(0, 5)
  const rate = (r: any, id: string) => { const x = (r?.data?.attendance as Att[] | undefined)?.find((a) => a.id === id); return x && x.sessions > 0 ? x.present / x.sessions : null }
  const improving = h1 && h2 ? d.attendance.map((a) => ({ a, delta: (rate(h2, a.id) ?? NaN) - (rate(h1, a.id) ?? NaN) })).filter((x) => x.delta >= 0.15).sort((x, y) => y.delta - x.delta).slice(0, 5) : []

  const q = new URLSearchParams({ from, to, ...(cls ? { class: cls } : {}) }).toString()
  const cards: [string, string][] = [
    ['Attendance rate', pctText(present, sessions)], ['Punctuality', pctText(punctual, present)], ['Task submission rate', pctText(submitted, assigned)],
    ['Approval rate', pctText(approved, submitted)], ['Rejection rate', pctText(rejected, submitted)], ['Avg verified score', avgScore == null ? '–' : `${avgScore}%`],
  ]
  return (<>
    <h2 className="mb-2 text-lg font-bold">Reports</h2>
    <form className="card print:hidden" method="get">
      <div className="grid grid-cols-2 gap-2">
        <div><label htmlFor="from" className="font-bold">From</label><input id="from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label htmlFor="to" className="font-bold">To</label><input id="to" name="to" type="date" defaultValue={to} className="input" /></div></div>
      <label htmlFor="class" className="font-bold">Class</label>
      <select id="class" name="class" defaultValue={cls ?? ''} className="input"><option value="">All my classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn w-full">Show report</button></form>

    <p className="mb-2 text-sm text-slate-600">{from} to {to}. Attendance counts verified check-ins only. Excused sessions count as not present.</p>
    <div className="mb-3 grid grid-cols-2 gap-2">{cards.map(([l, v]) => <div key={l} className="card !mb-0"><b className="block text-2xl">{v}</b>{l}</div>)}</div>

    <div className="card"><h3 className="mb-2 font-bold">Verified attendance by day</h3><AttendanceTrend data={d.daily} /></div>
    <div className="card"><h3 className="mb-2 font-bold">Points earned by activity</h3><PointsChart data={d.points} /></div>

    <div className="card"><h3 className="mb-2 font-bold">Class comparison</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Class</th><th>Attendance</th><th>Punctual</th><th>Tasks sent</th></tr></thead><tbody>
      {[...byClass].map(([n, c]) => <tr key={n} className="border-t"><td>{n}</td><td>{pctText(c.p, c.s)}</td><td>{pctText(c.pu, c.p)}</td><td>{pctText(c.sub, c.a)}</td></tr>)}</tbody></table></div>
      {!byClass.size && <p className="text-slate-600">No data in this period.</p>}</div>

    <div className="card"><h3 className="mb-2 font-bold">Students</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Student</th><th>Present</th><th>On time</th><th>Late</th><th>Tasks</th><th>Avg score</th></tr></thead><tbody>
      {d.attendance.map((a) => { const t = d.tasks.find((x) => x.id === a.id); return (
        <tr key={a.id + a.class_name} className="border-t"><td><Link href={`/staff/students/${a.id}`} className="underline">{a.full_name}</Link></td><td>{a.present}/{a.sessions}</td><td>{pctText(a.punctual, a.present)}</td><td>{a.late}</td>
          <td>{t ? `${t.submitted}/${t.assigned}` : '–'}</td><td>{t?.avg_pct != null ? `${t.avg_pct}%` : '–'}</td></tr>) })}</tbody></table></div>
      {!d.attendance.length && <p className="text-slate-600">No sessions in this period.</p>}</div>

    <div className="card"><h3 className="mb-2 font-bold">Frequently missing tasks</h3>
      {missers.map((t) => <p key={t.id + t.class_name} className="flex justify-between border-b py-1 last:border-0"><span>{t.full_name} <span className="text-sm text-slate-600">{t.class_name}</span></span><b>{t.missed} missed of {t.assigned}</b></p>)}
      {!missers.length && <p className="text-slate-600">No missed tasks in this period.</p>}</div>
    <div className="card"><h3 className="mb-2 font-bold">Attendance improving</h3>
      {days < 13 ? <p className="text-slate-600">Pick a range of two weeks or more to compare the first and second half.</p> : <>
        {improving.map((x) => <p key={x.a.id + x.a.class_name} className="flex justify-between border-b py-1 last:border-0"><span>{x.a.full_name}</span><b>+{Math.round(x.delta * 100)} points</b></p>)}
        {!improving.length && <p className="text-slate-600">No student improved by 15+ points between the two halves.</p>}</>}</div>
    {profile.role === 'admin' && <div className="card"><h3 className="mb-2 font-bold">Rewards redeemed</h3>
      {d.redemptions.map((r) => <p key={r.status} className="flex justify-between"><span>{r.status}</span><b>{r.n}</b></p>)}
      {!d.redemptions.length && <p className="text-slate-600">No redemption requests in this period.</p>}</div>}

    <div className="card print:hidden"><h3 className="mb-2 font-bold">Download CSV</h3><div className="flex flex-wrap gap-2">
      {[['attendance', 'Attendance'], ['tasks', 'Tasks'], ['points', 'Points'], ...(profile.role === 'admin' ? [['redemptions', 'Redemptions']] : [])].map(([t, l]) =>
        <a key={t} className="btn-sec inline-flex items-center" href={`/staff/reports/csv?type=${t}&${q}`}>{l}</a>)}</div>
      <div className="mt-3"><PrintButton /></div></div>
  </>)
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser, todayLagos, fmt, TZ } from '@/lib/auth'
import { pctText } from '@/lib/period'
import { streaks } from '@/lib/streak'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { setActiveAction, adjustPointsAction } from '@/app/admin-actions'

export default async function StudentDetail({ params }: { params: { id: string } }) {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const admin = profile.role === 'admin'
  // RLS decides what a tutor can read: a student outside their classes simply comes back empty.
  const { data: st } = await sb.from('profiles').select('id,full_name,student_code,active,created_at').eq('id', params.id).eq('role', 'student').maybeSingle()
  if (!st) notFound()

  const today = todayLagos()
  const since = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(st.created_at))
  const { data: cms } = await sb.from('class_members').select('class_id,classes(name)').eq('student_id', st.id)
  const classIds = (cms ?? []).map((c: any) => c.class_id)
  const none = ['00000000-0000-0000-0000-000000000000']

  const [sess, recs, asg, subs, bal, ledger, reds] = await Promise.all([
    sb.from('attendance_sessions').select('id,session_date').in('class_id', classIds.length ? classIds : none).gte('session_date', since).order('session_date', { ascending: false }).limit(1000),
    sb.from('attendance_records').select('session_id,checked_in_at,status,verification').eq('student_id', st.id).limit(1000),
    sb.from('task_assignments').select('tasks(id,title,assigned_date,max_score,deadline)').in('class_id', classIds.length ? classIds : none),
    sb.from('task_submissions').select('task_id,attempt,status,reported_score,verified_score,reviewer_comment').eq('student_id', st.id).order('attempt'),
    sb.from('wallet_balances').select('balance,total_earned,total_redeemed').eq('student_id', st.id).maybeSingle(),
    sb.from('points_ledger').select('points,reason,source,kind,created_at').eq('student_id', st.id).order('created_at', { ascending: false }).limit(1000),
    admin ? sb.from('redemptions').select('status,cost,created_at,rewards(name)').eq('student_id', st.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ])

  // ----- attendance -----
  const rec = new Map((recs.data ?? []).map((r) => [r.session_id, r]))
  const rows = (sess.data ?? []).map((s) => ({ date: s.session_date as string, r: rec.get(s.id) }))
  const ok = (r?: any) => !!r && r.verification === 'verified' && ['punctual', 'late'].includes(r.status)
  const counted = rows.filter((x) => x.r || x.date < today)        // today's open session isn't held against anyone
  const present = counted.filter((x) => ok(x.r)).length
  const punctual = counted.filter((x) => ok(x.r) && x.r?.status === 'punctual').length
  const late = counted.filter((x) => ok(x.r) && x.r?.status === 'late').length
  const { current: cur, longest } = streaks(rows.map((x) => ({ date: x.date, ok: ok(x.r) })), today)

  // ----- tasks -----
  const latest = new Map<string, any>(); const attempts = new Map<string, number>()
  ;(subs.data ?? []).forEach((s) => { latest.set(s.task_id, s); attempts.set(s.task_id, (attempts.get(s.task_id) ?? 0) + 1) })
  const seen = new Set<string>()
  const tasks = (asg.data ?? []).map((a: any) => a.tasks).filter((t: any) => t && t.assigned_date >= since && !seen.has(t.id) && seen.add(t.id))
    .sort((a: any, b: any) => (a.assigned_date < b.assigned_date ? 1 : -1))
    .map((t: any) => ({ t, s: latest.get(t.id), n: attempts.get(t.id) ?? 0 }))
  const due = tasks.filter((x) => x.s || new Date(x.t.deadline) < new Date())
  const submitted = due.filter((x) => x.s).length, approved = due.filter((x) => x.s?.status === 'approved').length
  const pcts = tasks.filter((x) => x.s?.status === 'approved' && x.s.verified_score != null && x.t.max_score > 0).map((x) => (x.s.verified_score / x.t.max_score) * 100)
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null

  // ----- points -----
  const bySource = new Map<string, number>()
  ;(ledger.data ?? []).filter((l) => l.kind === 'earn').forEach((l) => bySource.set(l.source, (bySource.get(l.source) ?? 0) + l.points))

  const cards: [string, string][] = [
    ['Points balance', String(bal.data?.balance ?? 0)], ['Attendance rate', pctText(present, counted.length)], ['Punctuality', pctText(punctual, present)],
    ['Current streak', `${cur} session${cur === 1 ? '' : 's'}`], ['Longest streak', `${longest}`], ['Tasks submitted', `${submitted}/${due.length}`],
    ['Approval rate', pctText(approved, submitted)], ['Avg verified score', avg == null ? '–' : `${avg}%`],
  ]
  const statusText = (r: any) => (!r ? 'no check-in' : r.verification === 'pending' ? `${r.status} · awaiting verification` : r.status)

  return (<>
    <Link href={admin ? '/staff/students' : '/staff/reports'} className="mb-2 inline-block text-sm font-semibold text-navy-700 print:hidden">← Back</Link>
    <div className="card bg-navy text-white"><h2 className="text-xl font-extrabold">{st.full_name}</h2>
      <p className="text-sm text-slate-300">{st.student_code} · {(cms ?? []).map((c: any) => c.classes?.name).join(', ') || 'No class'} · {st.active ? 'Active' : 'Inactive'}</p></div>
    <div className="mb-3 grid grid-cols-2 gap-2">{cards.map(([l, v]) => <div key={l} className="card !mb-0"><b className="block text-2xl">{v}</b>{l}</div>)}</div>
    <p className="mb-3 text-xs text-slate-500">Counted from {since}, when the account was created. Attendance counts verified check-ins only. Streaks count consecutive class sessions, not calendar days.</p>

    {admin && <div className="card print:hidden"><h3 className="mb-2 font-bold">Admin actions</h3>
      <ActionButton tone="sec" action={setActiveAction.bind(null, st.id, !st.active)} label={st.active ? 'Deactivate account' : 'Activate account'} confirmText={st.active ? `Deactivate ${st.full_name}?` : undefined} />
      <details className="mt-3"><summary className="cursor-pointer font-semibold">Adjust points</summary>
        <ActionForm action={adjustPointsAction} submit="Record adjustment"><input type="hidden" name="student" value={st.id} />
          <label htmlFor="pts" className="font-bold">Points (negative to deduct)</label><input id="pts" name="points" type="number" className="input" required />
          <label htmlFor="why" className="font-bold">Reason (required)</label><input id="why" name="reason" className="input" required /></ActionForm></details></div>}

    <div className="card"><h3 className="mb-2 font-bold">Attendance history</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Date</th><th>Status</th><th>Check-in (Lagos)</th></tr></thead><tbody>
      {rows.slice(0, 60).map((x, i) => <tr key={i} className="border-t"><td>{x.date}</td><td>{statusText(x.r)}</td><td>{x.r?.checked_in_at ? fmt(x.r.checked_in_at) : '–'}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className="text-slate-600">No class sessions yet.</p>}
      <p className="mt-1 text-sm text-slate-600">On time {punctual} · Late {late} · Showing the latest 60 sessions.</p></div>

    <div className="card"><h3 className="mb-2 font-bold">Task performance</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Task</th><th>Date</th><th>Status</th><th>Score</th><th>Tries</th></tr></thead><tbody>
      {tasks.slice(0, 60).map(({ t, s, n }) => <tr key={t.id} className="border-t"><td>{t.title}{s?.reviewer_comment && <div className="text-xs text-slate-600">Feedback: {s.reviewer_comment}</div>}</td><td>{t.assigned_date}</td>
        <td>{s ? s.status.replace('_', ' ') : new Date(t.deadline) < new Date() ? 'not submitted' : 'open'}</td>
        <td>{s?.verified_score != null ? `${s.verified_score}${t.max_score ? `/${t.max_score}` : ''}` : s?.reported_score != null ? `${s.reported_score} (reported)` : '–'}</td><td>{n || '–'}</td></tr>)}</tbody></table></div>
      {!tasks.length && <p className="text-slate-600">No tasks assigned yet.</p>}</div>

    <div className="card"><h3 className="mb-2 font-bold">Points</h3>
      <p className="text-sm text-slate-600">Earned {bal.data?.total_earned ?? 0} · Redeemed {bal.data?.total_redeemed ?? 0}</p>
      {[...bySource].map(([s, p]) => <p key={s} className="flex justify-between border-b py-1"><span>{s}</span><b>{p}</b></p>)}
      <h4 className="mb-1 mt-3 font-semibold">Ledger (latest 50)</h4>
      {(ledger.data ?? []).slice(0, 50).map((l, i) => <div key={i} className="flex justify-between border-b py-2 last:border-0"><span>{l.reason}<br /><small className="text-slate-500">{fmt(l.created_at)}</small></span>
        <b className={l.points > 0 ? 'text-emerald-700' : 'text-red-700'}>{l.points > 0 ? '+' : ''}{l.points}</b></div>)}
      {!ledger.data?.length && <p className="text-slate-600">No points yet.</p>}</div>

    {admin && <div className="card"><h3 className="mb-2 font-bold">Reward history</h3>
      {(reds.data ?? []).map((r: any, i: number) => <p key={i} className="flex justify-between border-b py-1 last:border-0"><span>{r.rewards?.name} <span className="text-sm text-slate-600">{fmt(r.created_at)}</span></span><span className="pill">{r.status} · {r.cost} pts</span></p>)}
      {!reds.data?.length && <p className="text-slate-600">No redemption requests.</p>}</div>}
  </>)
}

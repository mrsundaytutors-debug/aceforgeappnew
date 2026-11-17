import { requireUser, todayLagos, fmt } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { checkInAction } from '@/app/actions'

export default async function Dashboard() {
  const { sb, profile } = await requireUser(['student'])
  const today = todayLagos()
  const [{ data: bal }, { data: sessions }, { data: notes }] = await Promise.all([
    sb.from('wallet_balances').select('balance').eq('student_id', profile.id).maybeSingle(),
    sb.from('attendance_sessions').select('id, starts_at, late_after, classes(name)').eq('session_date', today),
    sb.from('notifications').select('body, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(3),
  ])
  const ids = (sessions ?? []).map((s: any) => s.id)
  const { data: recs } = ids.length ? await sb.from('attendance_records').select('*').eq('student_id', profile.id).in('session_id', ids) : { data: [] as any[] }

  return (
    <>
      <div className="card bg-navy text-white"><div>Welcome, {profile.full_name}</div><div className="text-5xl font-extrabold text-gold">{bal?.balance ?? 0} pts</div><div className="text-sm text-slate-300">Points are reward credits, not cash.</div></div>
      <h2 className="mb-2 text-lg font-bold">Today&apos;s attendance</h2>
      {!sessions?.length && <div className="card text-slate-600">No class session is open yet. Check back at class time.</div>}
      {(sessions ?? []).map((s: any) => {
        const r = recs?.find((x: any) => x.session_id === s.id)
        return (
          <div key={s.id} className="card">
            <b>{s.classes?.name}</b>
            {r ? <p>Checked in {r.checked_in_at ? fmt(r.checked_in_at) : ''} <span className="pill">{r.status}</span> <span className="pill">{r.verification}</span></p> : (
              <ActionForm action={checkInAction} submit="Check in for today's class">
                <input type="hidden" name="session" value={s.id} />
                <label htmlFor="code" className="font-bold">Class code from your tutor</label>
                <input id="code" name="code" className="input" autoCapitalize="characters" required />
              </ActionForm>)}
          </div>)
      })}
      <h2 className="mb-2 text-lg font-bold">Notifications</h2>
      {(notes ?? []).map((n, i) => <div key={i} className="card">{n.body}<div className="text-xs text-slate-500">{fmt(n.created_at)}</div></div>)}
      {!notes?.length && <div className="card text-slate-600">You&apos;re all caught up.</div>}
    </>
  )
}

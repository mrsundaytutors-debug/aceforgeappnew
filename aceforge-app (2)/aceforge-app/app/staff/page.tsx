import { requireUser, todayLagos } from '@/lib/auth'

export default async function StaffHome() {
  const { sb } = await requireUser(['admin', 'tutor'])
  const today = todayLagos()
  const { data: sess } = await sb.from('attendance_sessions').select('id').eq('session_date', today)
  const ids = (sess ?? []).map((s) => s.id)
  const count = async (q: any) => (await q).count ?? 0
  const [students, onTime, late, review, redeem] = await Promise.all([
    count(sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student')),   // RLS: tutors see only their students
    ids.length ? count(sb.from('attendance_records').select('id', { count: 'exact', head: true }).in('session_id', ids).eq('status', 'punctual')) : 0,
    ids.length ? count(sb.from('attendance_records').select('id', { count: 'exact', head: true }).in('session_id', ids).eq('status', 'late')) : 0,
    count(sb.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted')),
    count(sb.from('redemptions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
  ])
  const cards: [string, number][] = [['Students', students], ['On time today', onTime], ['Late today', late], ['Awaiting review', review], ['Pending prizes', redeem]]
  return (
    <>
      <h2 className="mb-2 text-lg font-bold">Dashboard</h2>
      <div className="grid grid-cols-2 gap-2">{cards.map(([l, n]) => <div key={l} className="card !mb-0"><b className="block text-3xl">{n}</b>{l}</div>)}</div>
    </>
  )
}

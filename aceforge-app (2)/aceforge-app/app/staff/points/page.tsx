import { requireUser, fmt } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { adjustPointsAction } from '@/app/admin-actions'

export default async function Points() {
  const { sb } = await requireUser(['admin'])
  const [{ data: students }, { data: ledger }, { data: bal }] = await Promise.all([
    sb.from('profiles').select('id,full_name,student_code').eq('role', 'student').order('full_name'),
    sb.from('points_ledger').select('id,student_id,points,reason,source,created_at').order('created_at', { ascending: false }).limit(40),
    sb.from('wallet_balances').select('student_id,balance'),
  ])
  const name = new Map((students ?? []).map((s) => [s.id, s.full_name]))
  const b = new Map((bal ?? []).map((x) => [x.student_id, x.balance]))
  return (<>
    <h2 className="mb-2 text-lg font-bold">Points</h2>
    <div className="card"><h3 className="mb-2 font-bold">Adjust points</h3>
      <ActionForm action={adjustPointsAction} submit="Record adjustment">
        <label htmlFor="student" className="font-bold">Student</label>
        <select id="student" name="student" className="input" required>{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code}) · {b.get(s.id) ?? 0} pts</option>)}</select>
        <label htmlFor="points" className="font-bold">Points (use a negative number to deduct)</label><input id="points" name="points" type="number" className="input" required />
        <label htmlFor="reason" className="font-bold">Reason (required, saved in the audit log)</label><input id="reason" name="reason" className="input" required />
      </ActionForm></div>
    <h3 className="mb-2 font-bold">Recent ledger entries</h3>
    <div className="card">{(ledger ?? []).map((l) => (
      <div key={l.id} className="flex justify-between border-b py-2 last:border-0"><span>{name.get(l.student_id)} · {l.reason}<br /><small className="text-slate-500">{fmt(l.created_at)} · {l.source}</small></span>
        <b className={l.points > 0 ? 'text-emerald-700' : 'text-red-700'}>{l.points > 0 ? '+' : ''}{l.points}</b></div>))}
      {!ledger?.length && <span className="text-slate-600">No entries yet.</span>}</div>
  </>)
}

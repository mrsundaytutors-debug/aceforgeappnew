import { requireUser, fmt } from '@/lib/auth'
import { ActionButton } from '@/components/ActionForm'
import { decideRedemptionAction } from '@/app/actions'

export default async function Redemptions() {
  const { sb } = await requireUser(['admin'])
  const { data } = await sb.from('redemptions').select('id,status,cost,created_at,rewards(name),profiles!redemptions_student_id_fkey(full_name)').order('created_at', { ascending: false })
  return (
    <>
      <h2 className="mb-2 text-lg font-bold">Prize requests</h2>
      {!data?.length && <div className="card text-slate-600">No requests yet.</div>}
      {(data ?? []).map((q: any) => (
        <div key={q.id} className="card">
          <div className="flex justify-between"><b>{q.profiles?.full_name} · {q.rewards?.name}</b><span className="pill">{q.status}</span></div>
          <p className="text-sm text-slate-600">{q.cost} pts · {fmt(q.created_at)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.status === 'pending' && <><ActionButton action={decideRedemptionAction.bind(null, q.id, 'approved')} label="Approve" /><ActionButton tone="sec" action={decideRedemptionAction.bind(null, q.id, 'rejected')} label="Reject" confirmText="Reject and refund the points?" /></>}
            {q.status === 'approved' && <ActionButton action={decideRedemptionAction.bind(null, q.id, 'ready')} label="Ready for collection" />}
            {q.status === 'ready' && <ActionButton action={decideRedemptionAction.bind(null, q.id, 'fulfilled')} label="Mark fulfilled" />}
          </div>
        </div>))}
    </>
  )
}

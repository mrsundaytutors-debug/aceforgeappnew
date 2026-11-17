import { requireUser } from '@/lib/auth'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { saveRewardAction, setRewardActiveAction, restockRewardAction } from '@/app/admin-actions'

export default async function Rewards() {
  const { sb } = await requireUser(['admin'])
  const { data: rewards } = await sb.from('rewards').select('*').order('cost')
  return (<>
    <h2 className="mb-2 text-lg font-bold">Rewards catalog</h2>
    <div className="card"><h3 className="mb-2 font-bold">Add a reward</h3>
      <ActionForm action={saveRewardAction} submit="Add reward">
        <label htmlFor="name" className="font-bold">Name</label><input id="name" name="name" className="input" required />
        <label htmlFor="description" className="font-bold">Description</label><input id="description" name="description" className="input" />
        <label htmlFor="cost" className="font-bold">Points required</label><input id="cost" name="cost" type="number" min={1} className="input" required />
        <label htmlFor="stock" className="font-bold">Quantity (blank = unlimited)</label><input id="stock" name="stock" type="number" min={0} className="input" />
        <label htmlFor="limit" className="font-bold">Limit per student (blank = none)</label><input id="limit" name="limit" type="number" min={1} className="input" />
        <label htmlFor="instructions" className="font-bold">Collection instructions</label><input id="instructions" name="instructions" className="input" />
      </ActionForm></div>
    {(rewards ?? []).map((r) => (
      <div key={r.id} className="card"><div className="flex justify-between"><b>{r.name}</b><span className="pill">{r.cost} pts · {r.stock ?? 'unlimited'} left · {r.active ? 'active' : 'hidden'}</span></div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <ActionButton tone="sec" action={setRewardActiveAction.bind(null, r.id, !r.active)} label={r.active ? 'Hide' : 'Show'} />
          <ActionForm action={restockRewardAction} submit="Update stock">
            <input type="hidden" name="id" value={r.id} />
            <input name="stock" type="number" min={0} aria-label="Set stock" placeholder="Set stock" className="input" required />
          </ActionForm></div></div>))}
    {!rewards?.length && <div className="card text-slate-600">No rewards yet. Add the first prize above.</div>}
  </>)
}

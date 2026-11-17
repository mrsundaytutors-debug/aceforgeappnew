import { requireUser, fmt } from '@/lib/auth'

export default async function Audit() {
  const { sb } = await requireUser(['admin'])
  const [{ data: logs }, { data: people }] = await Promise.all([
    sb.from('audit_logs').select('id,actor_id,action,detail,created_at').order('created_at', { ascending: false }).limit(100),
    sb.from('profiles').select('id,full_name'),
  ])
  const n = new Map((people ?? []).map((p) => [p.id, p.full_name]))
  return (<>
    <h2 className="mb-2 text-lg font-bold">Audit log</h2>
    {(logs ?? []).map((l) => (
      <div key={l.id} className="card"><b>{l.action.replaceAll('_', ' ')}</b> <span className="text-sm text-slate-600">by {n.get(l.actor_id) ?? 'system'} · {fmt(l.created_at)}</span>
        <pre className="mt-1 overflow-x-auto text-xs text-slate-600">{JSON.stringify(l.detail)}</pre></div>))}
    {!logs?.length && <div className="card text-slate-600">No actions recorded yet.</div>}
  </>)
}

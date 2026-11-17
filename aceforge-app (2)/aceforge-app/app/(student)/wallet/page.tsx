import { requireUser, fmt } from '@/lib/auth'
import { ActionButton } from '@/components/ActionForm'
import { redeemAction, cancelRedemptionAction } from '@/app/actions'

export default async function Wallet() {
  const { sb, profile } = await requireUser(['student'])
  const [{ data: w }, { data: rewards }, { data: reds }, { data: ledger }] = await Promise.all([
    sb.from('wallet_balances').select('*').eq('student_id', profile.id).maybeSingle(),
    sb.from('rewards').select('*').eq('active', true).order('cost'),
    sb.from('redemptions').select('id,status,cost,rewards(name)').eq('student_id', profile.id).order('created_at', { ascending: false }),
    sb.from('points_ledger').select('points,reason,created_at').eq('student_id', profile.id).order('created_at', { ascending: false }).limit(50),
  ])
  const balance = w?.balance ?? 0
  const next = (rewards ?? []).map((r) => r.cost).find((c) => c > balance)
  return (
    <>
      <div className="card bg-navy text-white">
        <div>My points</div><div className="text-5xl font-extrabold text-gold">{balance}</div>
        <div className="text-sm text-slate-300">Earned {w?.total_earned ?? 0} · Redeemed {w?.total_redeemed ?? 0}</div>
        {next && <div className="mt-2"><div className="h-2 overflow-hidden rounded bg-slate-600"><div className="h-full bg-gold" style={{ width: `${Math.min(100, (balance / next) * 100)}%` }} /></div><div className="text-xs">{balance} / {next} toward your next prize</div></div>}
      </div>
      <h2 className="mb-2 text-lg font-bold">Rewards</h2>
      {(rewards ?? []).map((r) => (
        <div key={r.id} className="card flex items-center justify-between gap-2">
          <div><b>{r.name}</b><div className="text-sm text-slate-600">{r.cost} pts{r.stock != null ? ` · ${r.stock} left` : ''}</div></div>
          {balance >= r.cost && (r.stock == null || r.stock > 0)
            ? <ActionButton action={redeemAction.bind(null, r.id)} label="Redeem reward" confirmText={`Redeem "${r.name}" for ${r.cost} points?`} />
            : <span className="pill">{r.stock === 0 ? 'Out of stock' : 'Keep earning'}</span>}
        </div>))}
      <h2 className="mb-2 text-lg font-bold">My requests</h2>
      {(reds ?? []).map((q: any) => (
        <div key={q.id} className="card flex items-center justify-between"><span>{q.rewards?.name} <span className="pill">{q.status}</span></span>
          {q.status === 'pending' && <ActionButton tone="sec" action={cancelRedemptionAction.bind(null, q.id)} label="Cancel" />}</div>))}
      {!reds?.length && <div className="card text-slate-600">No requests yet.</div>}
      <h2 className="mb-2 text-lg font-bold">History</h2>
      <div className="card">{(ledger ?? []).map((l, i) => (
        <div key={i} className="flex justify-between border-b py-2 last:border-0"><span>{l.reason}<br /><small className="text-slate-500">{fmt(l.created_at)}</small></span>
          <b className={l.points > 0 ? 'text-emerald-700' : 'text-red-700'}>{l.points > 0 ? '+' : ''}{l.points}</b></div>))}
        {!ledger?.length && <span className="text-slate-600">Nothing yet. Check in and submit a task to earn points.</span>}</div>
    </>
  )
}

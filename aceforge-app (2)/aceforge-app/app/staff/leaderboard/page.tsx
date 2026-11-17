import { requireUser, todayLagos } from '@/lib/auth'
import { addDays } from '@/lib/period'
import { Board, Tabs, METRICS, PERIODS } from '@/components/Board'

export default async function StaffBoard({ searchParams }: { searchParams: { metric?: string; period?: string; class?: string } }) {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  let classes: { id: string; name: string }[] = []
  if (profile.role === 'admin') classes = (await sb.from('classes').select('id,name').order('name')).data ?? []
  else classes = ((await sb.from('tutor_classes').select('classes(id,name)').eq('tutor_id', profile.id)).data ?? []).map((r: any) => r.classes)
  const metric = METRICS.some(([m]) => m === searchParams.metric) ? searchParams.metric! : 'points'
  const period = PERIODS.some(([p]) => p === searchParams.period) ? searchParams.period! : 'month'
  const cls = classes.find((c) => c.id === searchParams.class) ?? classes[0]
  const to = todayLagos(), from = period === 'week' ? addDays(to, -6) : period === 'month' ? addDays(to, -29) : '2000-01-01'
  return (<>
    <h2 className="mb-2 text-lg font-bold">Leaderboard</h2>
    {!cls && <div className="card text-slate-600">No classes available to you yet.</div>}
    {cls && <>
      <Tabs base="/staff/leaderboard" params={{ metric, period, class: cls.id }} name="class" options={classes.map((c): [string, string] => [c.id, c.name])} />
      <Tabs base="/staff/leaderboard" params={{ metric, period, class: cls.id }} name="metric" options={METRICS} />
      <Tabs base="/staff/leaderboard" params={{ metric, period, class: cls.id }} name="period" options={PERIODS} />
      <Board sb={sb} classId={cls.id} metric={metric} from={from} to={to} /></>}
  </>)
}

import { requireUser, todayLagos } from '@/lib/auth'
import { addDays } from '@/lib/period'
import { Board, Tabs, METRICS, PERIODS } from '@/components/Board'

export default async function StudentBoard({ searchParams }: { searchParams: { metric?: string; period?: string } }) {
  const { sb, profile } = await requireUser(['student'])
  const metric = METRICS.some(([m]) => m === searchParams.metric) ? searchParams.metric! : 'points'
  const period = PERIODS.some(([p]) => p === searchParams.period) ? searchParams.period! : 'week'
  const to = todayLagos(), from = period === 'week' ? addDays(to, -6) : period === 'month' ? addDays(to, -29) : '2000-01-01'
  const [{ data: st }, { data: cm }] = await Promise.all([
    sb.from('settings').select('leaderboard_enabled').eq('id', 1).maybeSingle(),
    sb.from('class_members').select('class_id').eq('student_id', profile.id).limit(1),
  ])
  return (<>
    <h2 className="mb-2 text-lg font-bold">Leaderboard</h2>
    {!st?.leaderboard_enabled && <div className="card text-slate-600">Leaderboards are switched off right now. Your own progress is on the Today and Wallet pages.</div>}
    {st?.leaderboard_enabled && !cm?.length && <div className="card text-slate-600">You are not in a class yet, so there is no leaderboard to show.</div>}
    {st?.leaderboard_enabled && cm?.[0] && <>
      <Tabs base="/leaderboard" params={{ metric, period }} name="metric" options={METRICS} />
      <Tabs base="/leaderboard" params={{ metric, period }} name="period" options={PERIODS} />
      <Board sb={sb} classId={cm[0].class_id} metric={metric} from={from} to={to} limit={5} /></>}
  </>)
}

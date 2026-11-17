import Link from 'next/link'
import { requireUser, todayLagos, fmt } from '@/lib/auth'

export default async function Tasks() {
  const { sb, profile } = await requireUser(['student'])
  const [{ data: tasks }, { data: subs }] = await Promise.all([
    sb.from('tasks').select('id,title,subject,deadline,point_reward,max_score').eq('assigned_date', todayLagos()).eq('status', 'active').order('deadline'),
    sb.from('task_submissions').select('task_id,status,attempt').eq('student_id', profile.id).order('attempt'),
  ])
  const status = (t: any) => {
    const s = (subs ?? []).filter((x) => x.task_id === t.id).pop()
    if (s) return s.status
    return new Date(t.deadline) < new Date() ? 'overdue' : 'not started'
  }
  return (
    <>
      <h2 className="mb-2 text-lg font-bold">Today&apos;s tasks</h2>
      {!tasks?.length && <div className="card text-slate-600">No tasks yet. Check back later.</div>}
      {(tasks ?? []).map((t) => (
        <Link key={t.id} href={`/tasks/${t.id}`} className="card block">
          <div className="flex justify-between"><b>{t.title}</b><span className="pill">{status(t)}</span></div>
          <p className="text-sm text-slate-600">{t.subject} · Due {fmt(t.deadline)} · {t.point_reward} pts{t.max_score ? ` · Max score ${t.max_score}` : ''}</p>
        </Link>))}
    </>
  )
}

import Link from 'next/link'
import { requireUser } from '@/lib/auth'

const items: [string, string, string][] = [
  ['/staff/reports', 'Reports', 'Attendance, tasks, points, charts, CSV downloads'],
  ['/staff/leaderboard', 'Leaderboards', 'Class rankings by points, attendance and tasks'],
  ['/staff/students', 'Students', 'Create accounts, assign classes, deactivate, reset passwords'],
  ['/staff/tutors', 'Tutors', 'Create tutors and choose which classes they can see'],
  ['/staff/classes', 'Classes', 'Add tutorial groups'],
  ['/staff/tasks', 'Daily tasks', 'Publish and close tasks'],
  ['/staff/rewards', 'Rewards catalog', 'Prizes, costs and stock'],
  ['/staff/points', 'Points', 'Adjust points with a recorded reason'],
  ['/staff/settings', 'Settings', 'Point values and streak rules'],
  ['/staff/audit', 'Audit log', 'Who changed what, and when'],
]
export default async function AdminHub() {
  const { profile } = await requireUser(['admin', 'tutor'])
  const list = profile.role === 'admin' ? items : items.filter((i) => ['/staff/tasks', '/staff/reports', '/staff/leaderboard'].includes(i[0]))
  return (<><h2 className="mb-2 text-lg font-bold">Manage</h2>
    {list.map(([href, t, d]) => <Link key={href} href={href} className="card block"><b>{t}</b><div className="text-sm text-slate-600">{d}</div></Link>)}</>)
}

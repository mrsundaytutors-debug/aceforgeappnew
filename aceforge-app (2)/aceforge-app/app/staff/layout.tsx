import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { Shell } from '@/components/Shell'
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireUser(['admin', 'tutor'])
  const links: [string, string][] = [['/staff', 'Dashboard'], ['/staff/attendance', 'Attendance'], ['/staff/review', 'Review']]
  if (profile.role === 'admin') links.push(['/staff/redemptions', 'Prizes'])
  links.push(['/staff/admin', 'Manage'])
  return <Shell name={`${profile.full_name} (${profile.role})`} links={links}>{children}</Shell>
}

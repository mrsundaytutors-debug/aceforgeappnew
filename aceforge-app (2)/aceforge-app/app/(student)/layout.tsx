import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { Shell } from '@/components/Shell'
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireUser(['student'])
  return <Shell name={`${profile.full_name} (${profile.student_code ?? ''})`} links={[['/dashboard', 'Today'], ['/tasks', 'Tasks'], ['/wallet', 'Wallet'], ['/leaderboard', 'Ranks']]}>{children}</Shell>
}

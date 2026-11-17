import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'

export type Role = 'admin' | 'tutor' | 'student'
import { TZ, todayLagos } from './dates'
export { TZ, todayLagos }
export const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })

/** Server-side role gate. Every page and action calls this; RLS is the second layer. */
export async function requireUser(roles?: Role[]) {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await sb.from('profiles').select('id, role, full_name, student_code, active').eq('id', user.id).single()
  if (!profile || !profile.active) redirect('/login')
  if (roles && !roles.includes(profile.role as Role)) redirect('/')
  return { sb, profile: profile as { id: string; role: Role; full_name: string; student_code: string | null; active: boolean } }
}

'use server'
import { revalidatePath } from 'next/cache'
import { requireUser, TZ } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

type R = { error?: string; ok?: string }
const fail = (e: any): R => ({ error: e?.message || 'Something went wrong. Try again.' })
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

async function audit(sb: any, actor: string, action: string, detail: any) {
  await sb.from('audit_logs').insert({ actor_id: actor, action, detail })
}

async function createLogin(role: 'student' | 'tutor', fd: FormData): Promise<R & { id?: string }> {
  const { sb, profile } = await requireUser(['admin'])
  const name = s(fd, 'name'), email = s(fd, 'email').toLowerCase(), password = s(fd, 'password')
  if (!name || !email) return { error: 'Enter a name and an email.' }
  if (password.length < 8) return { error: 'The temporary password needs at least 8 characters.' }
  const adm = supabaseAdmin()
  const { data: u, error: ue } = await adm.auth.admin.createUser({ email, password, email_confirm: true })
  if (ue || !u.user) return fail(ue)
  let code: string | null = null
  if (role === 'student') {
    const { count } = await adm.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student')
    code = `ACE-${String((count ?? 0) + 1).padStart(3, '0')}`
  }
  const { error: pe } = await sb.from('profiles').insert({ id: u.user.id, role, full_name: name, student_code: code })
  if (pe) { await adm.auth.admin.deleteUser(u.user.id); return fail(pe) }   // no orphan logins
  await audit(sb, profile.id, `${role}_created`, { id: u.user.id, code })
  return { ok: role === 'student' ? `Created ${code}. Share the temporary password privately.` : 'Tutor created. Share the temporary password privately.', id: u.user.id }
}

export async function createStudentAction(fd: FormData): Promise<R> {
  const r = await createLogin('student', fd); if (r.error || !r.id) return r
  const { sb } = await requireUser(['admin'])
  const cls = s(fd, 'class')
  if (cls) { const { error } = await sb.from('class_members').insert({ class_id: cls, student_id: r.id }); if (error) return fail(error) }
  revalidatePath('/staff/students'); return { ok: r.ok }
}
export async function createTutorAction(fd: FormData): Promise<R> {
  const r = await createLogin('tutor', fd); if (r.error || !r.id) return r
  const { sb } = await requireUser(['admin'])
  const rows = fd.getAll('classes').map((c) => ({ class_id: String(c), tutor_id: r.id! }))
  if (rows.length) { const { error } = await sb.from('tutor_classes').insert(rows); if (error) return fail(error) }
  revalidatePath('/staff/tutors'); return { ok: r.ok }
}
export async function setActiveAction(id: string, active: boolean): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  if (id === profile.id) return { error: 'You cannot deactivate your own account.' }
  const { error } = await sb.from('profiles').update({ active }).eq('id', id)
  if (error) return fail(error)
  await audit(sb, profile.id, active ? 'account_activated' : 'account_deactivated', { id })
  revalidatePath('/staff/students'); revalidatePath('/staff/tutors'); return {}
}
export async function resetPasswordAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const pw = s(fd, 'password'); if (pw.length < 8) return { error: 'Use at least 8 characters.' }
  const { error } = await supabaseAdmin().auth.admin.updateUserById(s(fd, 'id'), { password: pw })
  if (error) return fail(error)
  await audit(sb, profile.id, 'password_reset_by_admin', { id: s(fd, 'id') }); return { ok: 'Password updated.' }
}
export async function moveStudentAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const id = s(fd, 'id'), cls = s(fd, 'class')
  await sb.from('class_members').delete().eq('student_id', id)
  if (cls) { const { error } = await sb.from('class_members').insert({ class_id: cls, student_id: id }); if (error) return fail(error) }
  await audit(sb, profile.id, 'student_class_changed', { id, cls }); revalidatePath('/staff/students'); return { ok: 'Class updated.' }
}
export async function createClassAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const name = s(fd, 'name'); if (!name) return { error: 'Enter a class name.' }
  const { error } = await sb.from('classes').insert({ name, level: s(fd, 'level') || null })
  if (error) return { error: error.code === '23505' ? 'That class name already exists.' : error.message }
  await audit(sb, profile.id, 'class_created', { name }); revalidatePath('/staff/classes'); return { ok: 'Class created.' }
}

export async function createTaskAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const title = s(fd, 'title'), when = s(fd, 'deadline'), classes = fd.getAll('classes').map(String)
  if (!title || !when) return { error: 'Add a title and a deadline.' }
  if (!classes.length) return { error: 'Pick at least one class.' }
  const deadline = new Date(`${when}:00+01:00`)                       // Africa/Lagos (UTC+1, no DST)
  if (isNaN(deadline.getTime())) return { error: 'Enter a valid deadline.' }
  const assigned = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const max = s(fd, 'max')
  const { data: t, error } = await sb.from('tasks').insert({
    title, subject: s(fd, 'subject') || null, task_type: s(fd, 'type') || 'general', instructions: s(fd, 'instructions'),
    max_score: max === '' ? null : Number(max), point_reward: Number(s(fd, 'points') || 10), deadline: deadline.toISOString(),
    assigned_date: s(fd, 'date') || assigned, status: 'active', created_by: profile.id,
  }).select('id').single()
  if (error || !t) return fail(error)
  const { error: ae } = await sb.from('task_assignments').insert(classes.map((c) => ({ task_id: t.id, class_id: c })))
  if (ae) { await sb.from('tasks').delete().eq('id', t.id); return fail(ae) }
  const qs = s(fd, 'questions').split('\n').map((q) => q.trim()).filter(Boolean)
  if (qs.length) await sb.from('task_questions').insert(qs.map((body, i) => ({ task_id: t.id, position: i + 1, body })))
  // notify students in the target classes
  const { data: m } = await sb.from('class_members').select('student_id').in('class_id', classes)
  if (m?.length) await sb.from('notifications').insert(m.map((x: any) => ({ user_id: x.student_id, body: `New task: ${title}` })))
  await audit(sb, profile.id, 'task_created', { id: t.id, title })
  revalidatePath('/staff/tasks'); return { ok: 'Task published.' }
}
export async function setTaskStatusAction(id: string, status: 'active' | 'closed' | 'archived'): Promise<R> {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const { error } = await sb.from('tasks').update({ status }).eq('id', id)   // RLS: admin or creator only
  if (error) return fail(error)
  await audit(sb, profile.id, `task_${status}`, { id }); revalidatePath('/staff/tasks'); return {}
}

export async function adjustPointsAction(fd: FormData): Promise<R> {
  const { sb } = await requireUser(['admin'])
  const pts = Number(s(fd, 'points'))
  if (!Number.isInteger(pts) || pts === 0) return { error: 'Enter a whole number of points, not zero.' }
  const { error } = await sb.rpc('adjust_points', { p_student: s(fd, 'student'), p_points: pts, p_reason: s(fd, 'reason') })
  if (error) return fail(error); revalidatePath('/staff/points'); return { ok: 'Adjustment recorded.' }
}

export async function saveSettingsAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const keys = ['pts_attendance', 'pts_punctual', 'pts_task', 'pts_score_bonus', 'pts_all_tasks', 'pts_streak', 'streak_length', 'retention_days']
  const patch: Record<string, number> = {}
  for (const k of keys) { const v = Number(s(fd, k)); if (!Number.isInteger(v) || v < 0) return { error: `Check the value for ${k}.` }; patch[k] = v }
  if (patch.streak_length < 2) return { error: 'A streak needs at least 2 days.' }
  const { error } = await sb.from('settings').update(patch).eq('id', 1)
  if (error) return fail(error)
  await audit(sb, profile.id, 'settings_changed', patch); revalidatePath('/staff/settings'); return { ok: 'Settings saved. New rules apply to future awards only.' }
}

export async function saveRewardAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const name = s(fd, 'name'), cost = Number(s(fd, 'cost')), stock = s(fd, 'stock'), lim = s(fd, 'limit')
  if (!name || !Number.isInteger(cost) || cost < 1) return { error: 'Add a name and a cost of at least 1 point.' }
  const { error } = await sb.from('rewards').insert({
    name, description: s(fd, 'description') || null, cost, stock: stock === '' ? null : Number(stock),
    per_student_limit: lim === '' ? null : Number(lim), instructions: s(fd, 'instructions') || null, active: true,
  })
  if (error) return fail(error)
  await audit(sb, profile.id, 'reward_created', { name }); revalidatePath('/staff/rewards'); return { ok: 'Reward added.' }
}
export async function setRewardActiveAction(id: string, active: boolean): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const { error } = await sb.from('rewards').update({ active }).eq('id', id)
  if (error) return fail(error); await audit(sb, profile.id, active ? 'reward_enabled' : 'reward_disabled', { id }); revalidatePath('/staff/rewards'); return {}
}
export async function restockRewardAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const n = Number(s(fd, 'stock')); if (!Number.isInteger(n) || n < 0) return { error: 'Enter a stock number of 0 or more.' }
  const { error } = await sb.from('rewards').update({ stock: n }).eq('id', s(fd, 'id'))
  if (error) return fail(error); await audit(sb, profile.id, 'reward_restocked', { id: s(fd, 'id'), stock: n }); revalidatePath('/staff/rewards'); return { ok: 'Stock updated.' }
}

export async function setLeaderboardAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['admin'])
  const on = fd.get('enabled') === 'on'
  const { error } = await sb.from('settings').update({ leaderboard_enabled: on }).eq('id', 1)
  if (error) return fail(error)
  await audit(sb, profile.id, 'leaderboard_toggled', { on }); revalidatePath('/staff/settings'); revalidatePath('/leaderboard')
  return { ok: on ? 'Leaderboards are on for students.' : 'Leaderboards are off for students.' }
}

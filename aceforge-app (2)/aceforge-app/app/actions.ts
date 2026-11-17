'use server'
import { revalidatePath } from 'next/cache'
import { requireUser, todayLagos } from '@/lib/auth'

type R = { error?: string; ok?: string }
const fail = (e: any): R => ({ error: e?.message || 'Something went wrong. Try again.' })

// ---------- student ----------
export async function checkInAction(fd: FormData): Promise<R> {
  const { sb } = await requireUser(['student'])
  const { error } = await sb.rpc('check_in', { p_session: String(fd.get('session')), p_code: String(fd.get('code')).trim() })
  if (error) return fail(error)
  revalidatePath('/dashboard'); return { ok: 'Checked in. A tutor will verify your attendance.' }
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
export async function submitTaskAction(fd: FormData): Promise<R> {
  const { sb, profile } = await requireUser(['student'])
  const taskId = String(fd.get('task'))
  const file = fd.get('file') as File | null
  if (!file || !file.size) return { error: 'Choose a screenshot first.' }
  if (!TYPES.includes(file.type)) return { error: 'Use a JPG, PNG or WebP image.' }
  if (file.size > 5 * 1024 * 1024) return { error: 'The image is over 5 MB. Pick a smaller screenshot.' }

  const { data: prev } = await sb.from('task_submissions').select('attempt,status').eq('task_id', taskId).eq('student_id', profile.id).order('attempt', { ascending: false }).limit(1)
  if (prev?.[0] && !['rejected', 'resubmit_requested'].includes(prev[0].status)) return { error: 'You already submitted this task. Wait for the review.' }
  const attempt = (prev?.[0]?.attempt ?? 0) + 1

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${profile.id}/${taskId}-${attempt}.${ext}`   // folder = student id (storage policy)
  const up = await sb.storage.from('screenshots').upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) return fail(up.error)
  const score = String(fd.get('score') || '')
  const { error } = await sb.from('task_submissions').insert({
    task_id: taskId, student_id: profile.id, attempt, screenshot_path: path,
    reported_score: score === '' ? null : Number(score), note: String(fd.get('note') || '').slice(0, 500),
  })
  if (error) return fail(error)
  revalidatePath('/tasks'); return { ok: 'Submitted for review.' }
}

export async function redeemAction(rewardId: string): Promise<R> {
  const { sb } = await requireUser(['student'])
  const { error } = await sb.rpc('request_redemption', { p_reward: rewardId })
  if (error) return fail(error)
  revalidatePath('/wallet'); return {}
}
export async function cancelRedemptionAction(id: string): Promise<R> {
  const { sb } = await requireUser(['student'])
  const { error } = await sb.rpc('decide_redemption', { p_id: id, p_status: 'cancelled' })
  if (error) return fail(error); revalidatePath('/wallet'); return {}
}

// ---------- staff ----------
export async function createSessionAction(fd: FormData): Promise<R> {
  const { sb } = await requireUser(['admin', 'tutor'])
  const time = String(fd.get('time')), late = Number(fd.get('late') || 15), d = todayLagos()
  const starts = new Date(`${d}T${time}:00+01:00`)   // Africa/Lagos is UTC+1 all year
  if (isNaN(starts.getTime())) return { error: 'Enter a valid start time.' }
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { error } = await sb.from('attendance_sessions').insert({
    class_id: String(fd.get('class')), session_date: d, starts_at: starts.toISOString(),
    late_after: new Date(starts.getTime() + late * 60000).toISOString(), check_in_code: code,
  })
  if (error) return { error: error.code === '23505' ? 'A session already exists for this class today.' : error.message }
  revalidatePath('/staff/attendance'); return { ok: 'Session created.' }
}
export async function verifyAttendanceAction(recordId: string): Promise<R> {
  const { sb } = await requireUser(['admin', 'tutor'])
  const { error } = await sb.rpc('verify_attendance', { p_record: recordId })
  if (error) return fail(error); revalidatePath('/staff/attendance'); return {}
}
export async function markAttendanceAction(session: string, student: string, status: 'absent' | 'excused'): Promise<R> {
  const { sb } = await requireUser(['admin', 'tutor'])
  const { error } = await sb.rpc('mark_attendance', { p_session: session, p_student: student, p_status: status })
  if (error) return fail(error); revalidatePath('/staff/attendance'); return {}
}
export async function reviewAction(fd: FormData): Promise<R> {
  const { sb } = await requireUser(['admin', 'tutor'])
  const vs = String(fd.get('vscore') || '')
  const { error } = await sb.rpc('review_submission', {
    p_sub: String(fd.get('id')), p_decision: String(fd.get('decision')),
    p_comment: String(fd.get('comment') || ''), p_verified_score: vs === '' ? null : Number(vs),
  })
  if (error) return fail(error); revalidatePath('/staff/review'); return { ok: 'Saved.' }
}
export async function decideRedemptionAction(id: string, status: string): Promise<R> {
  const { sb } = await requireUser(['admin'])
  const { error } = await sb.rpc('decide_redemption', { p_id: id, p_status: status })
  if (error) return fail(error); revalidatePath('/staff/redemptions'); return {}
}

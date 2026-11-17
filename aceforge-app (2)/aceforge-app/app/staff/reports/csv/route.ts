import { NextResponse, type NextRequest } from 'next/server'
import { requireUser, TZ } from '@/lib/auth'
import { range } from '@/lib/period'
import { toCsv } from '@/lib/csv'

const lagos = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ }) : '')

async function all(q: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const out: any[] = []
  for (let i = 0; i < 20; i++) {                    // PostgREST returns at most 1000 rows per request
    const { data, error } = await q(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function GET(req: NextRequest) {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const p = req.nextUrl.searchParams
  const type = p.get('type') ?? ''
  const { from, to } = range({ from: p.get('from') ?? undefined, to: p.get('to') ?? undefined })
  const cls = p.get('class')
  if (type === 'redemptions' && profile.role !== 'admin') return new NextResponse('Admins only', { status: 403 })

  let ids: string[] | null = null
  if (cls) { const { data } = await sb.from('class_members').select('student_id').eq('class_id', cls); ids = (data ?? []).map((x) => x.student_id) }
  const scope = (q: any) => (ids ? q.in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : q)
  const t0 = `${from}T00:00:00+01:00`, t1 = `${to}T23:59:59+01:00`   // Africa/Lagos is UTC+1
  let head: string[] = [], rows: unknown[][] = []

  try {
    if (type === 'attendance') {
      head = ['Date', 'Class', 'Student ID', 'Student', 'Check-in (Lagos)', 'Status', 'Verification']
      const r = await all((a, b) => scope(sb.from('attendance_records')
        .select('checked_in_at,status,verification,profiles!attendance_records_student_id_fkey(full_name,student_code),attendance_sessions!inner(session_date,classes(name))')
        .gte('attendance_sessions.session_date', from).lte('attendance_sessions.session_date', to).order('id').range(a, b)))
      rows = r.map((x) => [x.attendance_sessions?.session_date, x.attendance_sessions?.classes?.name, x.profiles?.student_code, x.profiles?.full_name, lagos(x.checked_in_at), x.status, x.verification])
    } else if (type === 'tasks') {
      head = ['Task date', 'Task', 'Student ID', 'Student', 'Attempt', 'Status', 'Reported score', 'Verified score', 'Max score', 'Reviewer comment', 'Submitted (Lagos)']
      const r = await all((a, b) => scope(sb.from('task_submissions')
        .select('attempt,status,reported_score,verified_score,reviewer_comment,submitted_at,tasks!inner(title,assigned_date,max_score),profiles!task_submissions_student_id_fkey(full_name,student_code)')
        .gte('tasks.assigned_date', from).lte('tasks.assigned_date', to).order('id').range(a, b)))
      rows = r.map((x) => [x.tasks?.assigned_date, x.tasks?.title, x.profiles?.student_code, x.profiles?.full_name, x.attempt, x.status, x.reported_score, x.verified_score, x.tasks?.max_score, x.reviewer_comment, lagos(x.submitted_at)])
    } else if (type === 'points') {
      head = ['Date (Lagos)', 'Student ID', 'Student', 'Points', 'Type', 'Reason', 'Source']
      const r = await all((a, b) => scope(sb.from('points_ledger')
        .select('points,kind,reason,source,created_at,profiles!points_ledger_student_id_fkey(full_name,student_code)')
        .gte('created_at', t0).lte('created_at', t1).order('id').range(a, b)))
      rows = r.map((x) => [lagos(x.created_at), x.profiles?.student_code, x.profiles?.full_name, x.points, x.kind, x.reason, x.source])
    } else if (type === 'redemptions') {
      head = ['Requested (Lagos)', 'Student ID', 'Student', 'Reward', 'Points', 'Status']
      const r = await all((a, b) => scope(sb.from('redemptions')
        .select('status,cost,created_at,rewards(name),profiles!redemptions_student_id_fkey(full_name,student_code)')
        .gte('created_at', t0).lte('created_at', t1).order('id').range(a, b)))
      rows = r.map((x) => [lagos(x.created_at), x.profiles?.student_code, x.profiles?.full_name, x.rewards?.name, x.cost, x.status])
    } else return new NextResponse('Unknown report type', { status: 400 })
  } catch (e: any) { return new NextResponse(`Could not build the report: ${e.message}`, { status: 500 }) }

  await sb.from('audit_logs').insert({ actor_id: profile.id, action: 'report_exported', detail: { type, from, to, class: cls } })
  const csv = toCsv(head, rows)
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aceforge-${type}-${from}-to-${to}.csv"` } })
}

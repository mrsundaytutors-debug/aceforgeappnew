import Link from 'next/link'
import { requireUser, todayLagos } from '@/lib/auth'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { createSessionAction, verifyAttendanceAction, markAttendanceAction } from '@/app/actions'

export default async function Attendance() {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  const today = todayLagos()
  let classes: { id: string; name: string }[] = []
  if (profile.role === 'admin') classes = (await sb.from('classes').select('id,name').order('name')).data ?? []
  else {
    const { data } = await sb.from('tutor_classes').select('classes(id,name)').eq('tutor_id', profile.id)
    classes = (data ?? []).map((r: any) => r.classes)
  }
  return (
    <>
      <h2 className="mb-2 text-lg font-bold">Attendance · {today}</h2>
      {classes.length === 0 && <div className="card text-slate-600">No classes are assigned to you yet.</div>}
      {await Promise.all(classes.map(async (c) => {
        const { data: s } = await sb.from('attendance_sessions').select('id,starts_at,late_after').eq('class_id', c.id).eq('session_date', today).maybeSingle()
        if (!s) return (
          <div key={c.id} className="card"><h3 className="mb-2 font-bold">{c.name}</h3>
            <ActionForm action={createSessionAction} submit="Open today's session">
              <input type="hidden" name="class" value={c.id} />
              <label htmlFor={`t${c.id}`} className="font-bold">Class start (Lagos time)</label>
              <input id={`t${c.id}`} name="time" type="time" defaultValue="16:00" className="input" required />
              <label htmlFor={`l${c.id}`} className="font-bold">Late after (minutes)</label>
              <input id={`l${c.id}`} name="late" type="number" defaultValue={15} min={0} className="input" />
            </ActionForm></div>)
        const [{ data: code }, { data: members }, { data: recs }] = await Promise.all([
          sb.rpc('session_code', { p_session: s.id }),
          sb.from('class_members').select('student_id, profiles(full_name)').eq('class_id', c.id),
          sb.from('attendance_records').select('*').eq('session_id', s.id),
        ])
        return (
          <div key={c.id} className="card"><h3 className="font-bold">{c.name}</h3>
            <p className="mb-2">Today&apos;s code: <b className="text-xl">{code}</b> <span className="text-sm text-slate-600">Share it in class only.</span></p>
            {(members ?? []).map((m: any) => {
              const r = recs?.find((x) => x.student_id === m.student_id)
              const locked = r?.verification === 'verified'
              return (
                <div key={m.student_id} className="border-t py-2">
                  <div className="flex justify-between"><Link href={`/staff/students/${m.student_id}`} className="underline">{m.profiles?.full_name}</Link>
                    {r ? <span><span className="pill">{r.status}</span> <span className="pill">{r.verification}</span></span> : <span className="pill">no check-in</span>}</div>
                  {!locked && <div className="mt-2 flex flex-wrap gap-2">
                    {r && r.status !== 'absent' && r.status !== 'excused' && <ActionButton action={verifyAttendanceAction.bind(null, r.id)} label="Verify" />}
                    <ActionButton tone="sec" action={markAttendanceAction.bind(null, s.id, m.student_id, 'absent')} label="Absent" />
                    <ActionButton tone="sec" action={markAttendanceAction.bind(null, s.id, m.student_id, 'excused')} label="Excused" /></div>}
                </div>)
            })}
          </div>)
      }))}
    </>
  )
}

import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { createStudentAction, setActiveAction, resetPasswordAction, moveStudentAction } from '@/app/admin-actions'

export default async function Students() {
  const { sb } = await requireUser(['admin'])
  const [{ data: classes }, { data: students }, { data: bal }] = await Promise.all([
    sb.from('classes').select('id,name').order('name'),
    sb.from('profiles').select('id,full_name,student_code,active,class_members(class_id)').eq('role', 'student').order('student_code'),
    sb.from('wallet_balances').select('student_id,balance'),
  ])
  const b = new Map((bal ?? []).map((x) => [x.student_id, x.balance]))
  return (<>
    <h2 className="mb-2 text-lg font-bold">Students</h2>
    <div className="card"><h3 className="mb-2 font-bold">Register a student</h3>
      <ActionForm action={createStudentAction} submit="Create student">
        <label htmlFor="n" className="font-bold">Full name</label><input id="n" name="name" className="input" required />
        <label htmlFor="e" className="font-bold">Email (their login)</label><input id="e" name="email" type="email" className="input" required />
        <label htmlFor="p" className="font-bold">Temporary password (8+ characters)</label><input id="p" name="password" type="text" minLength={8} className="input" required />
        <label htmlFor="c" className="font-bold">Class</label>
        <select id="c" name="class" className="input"><option value="">No class yet</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </ActionForm></div>
    {(students ?? []).map((s: any) => (
      <div key={s.id} className="card">
        <div className="flex justify-between"><b><Link href={`/staff/students/${s.id}`} className="underline">{s.full_name}</Link> <span className="text-sm font-normal text-slate-600">{s.student_code}</span></b>
          <span className="pill">{s.active ? 'active' : 'inactive'} · {b.get(s.id) ?? 0} pts</span></div>
        <div className="mt-2 flex flex-wrap gap-2">
          <ActionButton tone="sec" action={setActiveAction.bind(null, s.id, !s.active)} label={s.active ? 'Deactivate' : 'Activate'} confirmText={s.active ? `Deactivate ${s.full_name}? They will not be able to log in.` : undefined} />
        </div>
        <details className="mt-2"><summary className="cursor-pointer font-semibold">Class and password</summary>
          <ActionForm action={moveStudentAction} submit="Change class"><input type="hidden" name="id" value={s.id} />
            <select name="class" defaultValue={s.class_members?.[0]?.class_id ?? ''} className="input" aria-label="Class"><option value="">No class</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></ActionForm>
          <div className="h-3" />
          <ActionForm action={resetPasswordAction} submit="Set new password"><input type="hidden" name="id" value={s.id} />
            <input name="password" type="text" minLength={8} className="input" aria-label="New temporary password" placeholder="New temporary password" /></ActionForm>
        </details>
      </div>))}
    {!students?.length && <div className="card text-slate-600">No students yet. Register the first one above.</div>}
  </>)
}

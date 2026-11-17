import { notFound } from 'next/navigation'
import { requireUser, fmt } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { submitTaskAction } from '@/app/actions'

export default async function TaskDetail({ params }: { params: { id: string } }) {
  const { sb, profile } = await requireUser(['student'])
  const { data: t } = await sb.from('tasks').select('*').eq('id', params.id).maybeSingle()   // RLS hides tasks not assigned to this student
  if (!t) notFound()
  const { data: subs } = await sb.from('task_submissions').select('*').eq('task_id', t.id).eq('student_id', profile.id).order('attempt')
  const last = subs?.[subs.length - 1]
  const canSubmit = !last || ['rejected', 'resubmit_requested'].includes(last.status)
  return (
    <>
      <div className="card"><h2 className="text-lg font-bold">{t.title}</h2>
        <p className="text-sm text-slate-600">{t.subject} · Due {fmt(t.deadline)} · {t.point_reward} pts</p>
        <p className="mt-2 whitespace-pre-wrap">{t.instructions}</p></div>
      {(subs ?? []).map((s) => (
        <div key={s.id} className="card"><b>Attempt {s.attempt}</b> <span className="pill">{s.status}</span>
          <p className="text-sm text-slate-600">Submitted {fmt(s.submitted_at)}</p>
          {s.reviewer_comment && <p><b>Feedback:</b> {s.reviewer_comment}</p>}</div>))}
      {canSubmit && (
        <div className="card"><h3 className="mb-2 font-bold">{last ? 'Resubmit your result' : 'Submit your result'}</h3>
          <ActionForm action={submitTaskAction} submit={last ? 'Resubmit screenshot' : 'Submit screenshot'}>
            <input type="hidden" name="task" value={t.id} />
            <label htmlFor="file" className="font-bold">Screenshot (JPG, PNG or WebP, up to 5 MB)</label>
            <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="input" />
            <label htmlFor="score" className="font-bold">Your score (optional)</label>
            <input id="score" name="score" type="number" min="0" className="input" />
            <label htmlFor="note" className="font-bold">Note (optional)</label>
            <input id="note" name="note" maxLength={500} className="input" />
          </ActionForm></div>)}
    </>
  )
}

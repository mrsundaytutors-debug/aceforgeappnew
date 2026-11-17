import Link from 'next/link'
import { requireUser, fmt } from '@/lib/auth'
import { ReviewForm } from '@/components/ReviewForm'

export default async function ReviewQueue() {
  const { sb } = await requireUser(['admin', 'tutor'])
  const { data: subs } = await sb.from('task_submissions')
    .select('id,student_id,screenshot_path,reported_score,note,attempt,submitted_at,tasks(title,max_score),profiles!task_submissions_student_id_fkey(full_name)')
    .eq('status', 'submitted').order('submitted_at')
  const items = await Promise.all((subs ?? []).map(async (s: any) => ({
    ...s, url: (await sb.storage.from('screenshots').createSignedUrl(s.screenshot_path, 60)).data?.signedUrl,   // 60-second private link
  })))
  return (
    <>
      <h2 className="mb-2 text-lg font-bold">Review queue</h2>
      {!items.length && <div className="card text-slate-600">Nothing to review right now.</div>}
      {items.map((s: any) => (
        <div key={s.id} className="card">
          <h3 className="font-bold"><Link href={`/staff/students/${s.student_id}`} className="underline">{s.profiles?.full_name}</Link> · {s.tasks?.title}</h3>
          <p className="text-sm text-slate-600">Attempt {s.attempt} · {fmt(s.submitted_at)} · Student-reported score: {s.reported_score ?? 'none'}</p>
          {s.note && <p>{s.note}</p>}
          {s.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.url} alt="Submitted screenshot" className="my-2 max-w-full rounded-lg border" />}
          <ReviewForm id={s.id} max={s.tasks?.max_score ?? null} />
        </div>))}
    </>
  )
}

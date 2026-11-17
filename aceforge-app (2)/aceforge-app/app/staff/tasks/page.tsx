import { requireUser, fmt } from '@/lib/auth'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { createTaskAction, setTaskStatusAction } from '@/app/admin-actions'

export default async function TaskAdmin() {
  const { sb, profile } = await requireUser(['admin', 'tutor'])
  let classes: { id: string; name: string }[] = []
  if (profile.role === 'admin') classes = (await sb.from('classes').select('id,name').order('name')).data ?? []
  else classes = ((await sb.from('tutor_classes').select('classes(id,name)').eq('tutor_id', profile.id)).data ?? []).map((r: any) => r.classes)
  const { data: tasks } = await sb.from('tasks').select('id,title,subject,deadline,status,assigned_date,point_reward,created_by').order('assigned_date', { ascending: false }).limit(30)
  return (<>
    <h2 className="mb-2 text-lg font-bold">Daily tasks</h2>
    <div className="card"><h3 className="mb-2 font-bold">Publish a task</h3>
      <ActionForm action={createTaskAction} submit="Publish task">
        <label htmlFor="title" className="font-bold">Title</label><input id="title" name="title" className="input" required />
        <label htmlFor="subject" className="font-bold">Subject</label><input id="subject" name="subject" className="input" />
        <label htmlFor="type" className="font-bold">Type</label>
        <select id="type" name="type" className="input">{['multiple_choice', 'objective', 'theory', 'numerical', 'external_cbt', 'general'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select>
        <label htmlFor="instructions" className="font-bold">Instructions</label><textarea id="instructions" name="instructions" rows={3} className="input" />
        <label htmlFor="questions" className="font-bold">Questions (optional, one per line)</label><textarea id="questions" name="questions" rows={3} className="input" />
        <fieldset className="mb-3"><legend className="font-bold">Classes</legend>
          {classes.map((c) => <label key={c.id} className="mr-4 inline-flex min-h-[44px] items-center gap-2"><input type="checkbox" name="classes" value={c.id} className="h-5 w-5" />{c.name}</label>)}
          {!classes.length && <p className="text-sm text-slate-600">No classes available to you yet.</p>}</fieldset>
        <label htmlFor="deadline" className="font-bold">Deadline (Lagos time)</label><input id="deadline" name="deadline" type="datetime-local" className="input" required />
        <label htmlFor="date" className="font-bold">Task date (leave blank for today)</label><input id="date" name="date" type="date" className="input" />
        <label htmlFor="max" className="font-bold">Maximum score</label><input id="max" name="max" type="number" min="0" className="input" />
        <label htmlFor="points" className="font-bold">Points for approved work</label><input id="points" name="points" type="number" min="0" defaultValue={10} className="input" />
      </ActionForm></div>
    {(tasks ?? []).map((t) => (
      <div key={t.id} className="card"><div className="flex justify-between"><b>{t.title}</b><span className="pill">{t.status}</span></div>
        <p className="text-sm text-slate-600">{t.subject} · {t.assigned_date} · due {fmt(t.deadline)} · {t.point_reward} pts</p>
        {(profile.role === 'admin' || t.created_by === profile.id) && <div className="mt-2 flex gap-2">
          {t.status === 'active' && <ActionButton tone="sec" action={setTaskStatusAction.bind(null, t.id, 'closed')} label="Close" />}
          {t.status === 'closed' && <ActionButton tone="sec" action={setTaskStatusAction.bind(null, t.id, 'archived')} label="Archive" />}</div>}
      </div>))}
    {!tasks?.length && <div className="card text-slate-600">No tasks yet. Publish the first one above.</div>}
  </>)
}

import { requireUser } from '@/lib/auth'
import { ActionForm, ActionButton } from '@/components/ActionForm'
import { createTutorAction, setActiveAction } from '@/app/admin-actions'

export default async function Tutors() {
  const { sb } = await requireUser(['admin'])
  const [{ data: classes }, { data: tutors }] = await Promise.all([
    sb.from('classes').select('id,name').order('name'),
    sb.from('profiles').select('id,full_name,active,tutor_classes(classes(name))').eq('role', 'tutor').order('full_name'),
  ])
  return (<>
    <h2 className="mb-2 text-lg font-bold">Tutors</h2>
    <div className="card"><h3 className="mb-2 font-bold">Add a tutor</h3>
      <ActionForm action={createTutorAction} submit="Create tutor">
        <label htmlFor="n" className="font-bold">Full name</label><input id="n" name="name" className="input" required />
        <label htmlFor="e" className="font-bold">Email (their login)</label><input id="e" name="email" type="email" className="input" required />
        <label htmlFor="p" className="font-bold">Temporary password (8+ characters)</label><input id="p" name="password" type="text" minLength={8} className="input" required />
        <fieldset className="mb-3"><legend className="font-bold">Classes they can see</legend>
          {(classes ?? []).map((c) => <label key={c.id} className="mr-4 inline-flex min-h-[44px] items-center gap-2"><input type="checkbox" name="classes" value={c.id} className="h-5 w-5" />{c.name}</label>)}
          {!classes?.length && <p className="text-sm text-slate-600">Add a class first.</p>}</fieldset>
      </ActionForm></div>
    {(tutors ?? []).map((t: any) => (
      <div key={t.id} className="card flex items-center justify-between gap-2">
        <span><b>{t.full_name}</b><br /><span className="text-sm text-slate-600">{(t.tutor_classes ?? []).map((x: any) => x.classes?.name).join(', ') || 'No classes'}</span></span>
        <ActionButton tone="sec" action={setActiveAction.bind(null, t.id, !t.active)} label={t.active ? 'Deactivate' : 'Activate'} />
      </div>))}
  </>)
}

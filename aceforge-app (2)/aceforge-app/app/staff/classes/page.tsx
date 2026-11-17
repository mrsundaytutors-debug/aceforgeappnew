import { requireUser } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { createClassAction } from '@/app/admin-actions'

export default async function Classes() {
  const { sb } = await requireUser(['admin'])
  const { data: classes } = await sb.from('classes').select('id,name,level,class_members(count)').order('name')
  return (<>
    <h2 className="mb-2 text-lg font-bold">Classes</h2>
    <div className="card"><h3 className="mb-2 font-bold">Add a class</h3>
      <ActionForm action={createClassAction} submit="Create class">
        <label htmlFor="name" className="font-bold">Class name</label><input id="name" name="name" className="input" required />
        <label htmlFor="level" className="font-bold">Level (optional)</label><input id="level" name="level" className="input" />
      </ActionForm></div>
    {(classes ?? []).map((c: any) => <div key={c.id} className="card flex justify-between"><span><b>{c.name}</b> {c.level && <span className="text-sm text-slate-600">· {c.level}</span>}</span><span className="pill">{c.class_members?.[0]?.count ?? 0} students</span></div>)}
    {!classes?.length && <div className="card text-slate-600">No classes yet. Add one above.</div>}
  </>)
}

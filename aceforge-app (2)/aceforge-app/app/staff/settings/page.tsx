import { requireUser } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { saveSettingsAction, setLeaderboardAction } from '@/app/admin-actions'

const fields: [string, string][] = [
  ['pts_attendance', 'Verified attendance'], ['pts_punctual', 'Punctual arrival bonus'], ['pts_task', 'Default points per approved task (new tasks start here)'],
  ['pts_score_bonus', 'Bonus for 80%+ verified score'], ['pts_all_tasks', 'Bonus for completing all of a day\'s tasks'],
  ['pts_streak', 'Streak bonus'], ['streak_length', 'Streak length (verified days)'], ['retention_days', 'Keep screenshots for (days)'],
]
export default async function Settings() {
  const { sb } = await requireUser(['admin'])
  const { data: st } = await sb.from('settings').select('*').eq('id', 1).single()
  return (<>
    <h2 className="mb-2 text-lg font-bold">Settings</h2>
    <div className="card"><p className="mb-3 text-sm text-slate-600">Class start time and the late threshold are set when you open each day&apos;s session on the Attendance page. Timezone is Africa/Lagos. Changes apply to future awards only; past ledger entries never change.</p>
      <ActionForm action={saveSettingsAction} submit="Save settings">
        {fields.map(([k, label]) => (<div key={k}><label htmlFor={k} className="font-bold">{label}</label>
          <input id={k} name={k} type="number" min={0} defaultValue={st?.[k]} className="input" required /></div>))}
      </ActionForm></div>
    <div className="card"><h3 className="mb-2 font-bold">Leaderboards</h3>
      <ActionForm action={setLeaderboardAction} submit="Save leaderboard setting">
        <label className="mb-3 flex min-h-[44px] items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={st?.leaderboard_enabled} className="h-5 w-5" />Show class leaderboards to students (first name and last initial only)</label>
      </ActionForm></div>
    <div className="card text-sm text-slate-600"><b>Privacy notice.</b> This app stores each student&apos;s name, login email, class, attendance, task screenshots and points. Screenshots are private to the student and their tutors. The retention value above is a record of the policy; deleting old screenshots is not automated yet.</div>
  </>)
}

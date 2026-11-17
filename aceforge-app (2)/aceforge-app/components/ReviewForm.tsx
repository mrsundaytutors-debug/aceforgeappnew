'use client'
import { useState, useTransition } from 'react'
import { reviewAction } from '@/app/actions'

export function ReviewForm({ id, max }: { id: string; max: number | null }) {
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  function send(form: HTMLFormElement, decision: string) {
    const fd = new FormData(form); fd.set('id', id); fd.set('decision', decision)
    if (decision !== 'approved' && !String(fd.get('comment') || '').trim()) { setMsg('Add feedback before rejecting or requesting a new screenshot.'); return }
    start(async () => { const r = await reviewAction(fd); setMsg(r?.error || r?.ok || '') })
  }
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor={`v${id}`} className="font-bold">Verified score{max ? ` (of ${max})` : ''}</label>
      <input id={`v${id}`} name="vscore" type="number" min="0" className="input" />
      <label htmlFor={`c${id}`} className="font-bold">Feedback (required unless approving)</label>
      <input id={`c${id}`} name="comment" className="input" />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} className="btn" onClick={(e) => send(e.currentTarget.form!, 'approved')}>Approve</button>
        <button disabled={pending} className="btn-sec" onClick={(e) => send(e.currentTarget.form!, 'rejected')}>Reject</button>
        <button disabled={pending} className="btn-sec" onClick={(e) => send(e.currentTarget.form!, 'resubmit_requested')}>Ask for a clearer screenshot</button>
      </div>
      {msg && <p role="status" className="mt-2 font-semibold">{msg}</p>}
    </form>
  )
}

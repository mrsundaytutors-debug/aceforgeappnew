'use client'
import { useState, useTransition, type ReactNode } from 'react'

type Result = { error?: string; ok?: string } | void
export function ActionForm({ action, children, submit }: { action: (fd: FormData) => Promise<Result>; children?: ReactNode; submit: string }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const [pending, start] = useTransition()
  return (
    <form action={(fd: FormData) => start(async () => { setMsg((await action(fd)) || {}) })}>
      {children}
      <button className="btn w-full" disabled={pending}>{pending ? 'Working…' : submit}</button>
      {msg.error && <p role="alert" className="mt-2 font-semibold text-red-700">{msg.error}</p>}
      {msg.ok && <p role="status" className="mt-2 font-semibold text-emerald-700">{msg.ok}</p>}
    </form>
  )
}

export function ActionButton({ action, label, confirmText, tone }: { action: () => Promise<Result>; label: string; confirmText?: string; tone?: 'sec' }) {
  const [msg, setMsg] = useState<string>('')
  const [pending, start] = useTransition()
  return (
    <span>
      <button className={tone === 'sec' ? 'btn-sec' : 'btn'} disabled={pending}
        onClick={() => { if (confirmText && !confirm(confirmText)) return; start(async () => { const r = await action(); setMsg((r && r.error) || '') }) }}>
        {pending ? 'Working…' : label}
      </button>
      {msg && <span role="alert" className="ml-2 text-sm font-semibold text-red-700">{msg}</span>}
    </span>
  )
}

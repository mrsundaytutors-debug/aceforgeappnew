import Link from 'next/link'
import type { ReactNode } from 'react'
import { supabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function signOut() { 'use server'; await supabaseServer().auth.signOut(); redirect('/login') }

export function Shell({ name, links, children }: { name: string; links: [string, string][]; children: ReactNode }) {
  return (
    <div className="pb-20">
      <header className="print:hidden flex items-center justify-between gap-2 bg-navy px-4 py-3 text-white">
        <div><b>Aceforge Student Success System</b><div className="text-xs text-amber-300">Show Up. Stay Punctual. Practice Daily. Earn Rewards.</div></div>
        <form action={signOut}><button className="rounded-lg border border-amber-300 px-3 py-1 text-sm">Log out</button></form>
      </header>
      <main className="mx-auto max-w-3xl p-3"><p className="mb-2 text-sm text-slate-600">Signed in as {name}</p>{children}</main>
      <nav className="print:hidden fixed inset-x-0 bottom-0 flex justify-around bg-navy py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {links.map(([href, label]) => <Link key={href} href={href} className="px-2 py-2 text-sm text-slate-200">{label}</Link>)}
      </nav>
    </div>
  )
}

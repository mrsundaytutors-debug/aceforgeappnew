import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

async function login(fd: FormData) {
  'use server'
  const sb = supabaseServer()
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get('email')), password: String(fd.get('password')) })
  if (error) redirect('/login?e=1')
  redirect('/')
}
async function reset(fd: FormData) {
  'use server'
  await supabaseServer().auth.resetPasswordForEmail(String(fd.get('email')))   // set the redirect URL in Supabase Auth settings
  redirect('/login?r=1')
}

export default function Login({ searchParams }: { searchParams: { e?: string; r?: string } }) {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Aceforge Student Success System</h1>
      <p className="mb-4 text-sm text-slate-600">Show Up. Stay Punctual. Practice Daily. Earn Rewards.</p>
      <form action={login} className="card">
        <label htmlFor="email" className="font-bold">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        <label htmlFor="password" className="font-bold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        {searchParams.e && <p role="alert" className="mb-2 font-semibold text-red-700">Wrong email or password, or your account is inactive.</p>}
        <button className="btn w-full">Log in</button>
      </form>
      <form action={reset} className="card">
        <label htmlFor="remail" className="font-bold">Forgot your password?</label>
        <input id="remail" name="email" type="email" required className="input" placeholder="Your email" />
        {searchParams.r && <p role="status" className="mb-2 text-emerald-700">If that email is registered, a reset link is on its way.</p>}
        <button className="btn-sec w-full">Send reset link</button>
      </form>
      <p className="text-xs text-slate-500">Points are reward credits, not cash. We collect only what the academy needs to run classes.</p>
    </main>
  )
}

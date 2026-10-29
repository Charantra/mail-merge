'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/mail-merge/ui/kit'

const STEPS = ['Import your investor list.', 'Personalize and review.', 'Send through Outlook.']

/** A value that came from the spreadsheet, marked the way the composer marks merge fields. */
function Merged({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[2px] bg-orange-50 text-navy shadow-[inset_0_-1px_0_rgba(255,117,31,0.55)]">{children}</span>
}

/** One merged email as the Preview step shows it. Sample data only; nothing here is sent. */
function SamplePreview() {
  return (
    <figure className="bg-white text-navy rounded-xl shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] overflow-hidden" aria-label="Sample of a personalized email">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-line bg-canvas text-xs">
        <span className="font-semibold text-navy/70">Preview · record 1</span>
        <span className="text-navy/55">Sample data, not sent</span>
      </div>
      <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 px-5 py-4 border-b border-line text-[13px]">
        <dt className="text-navy/55">To</dt>
        <dd className="truncate">
          <Merged>Asha Rao</Merged> <span className="text-navy/60">&lt;<Merged>asha.rao@example.com</Merged>&gt;</span>
        </dd>
        <dt className="text-navy/55">Subject</dt>
        <dd className="font-semibold">
          <Merged>Example Ventures</Merged> x Charantra: <Merged>Series A</Merged> opportunity
        </dd>
      </dl>
      <div className="px-5 py-4 text-[13px] leading-relaxed text-navy/85 space-y-3">
        <p>
          Dear <Merged>Asha</Merged>,
        </p>
        <p>
          Given <Merged>Example Ventures</Merged>&apos;s focus on <Merged>Fintech</Merged>, I wanted to share a <Merged>Series A</Merged> opportunity we
          are advising on. The round fits your typical ticket of <Merged>$2,500,000</Merged>.
        </p>
        <p>Would you have 20 minutes next week?</p>
      </div>
      <figcaption className="px-5 py-2.5 border-t border-line text-xs text-navy/55">Underlined text comes from the spreadsheet row.</figcaption>
    </figure>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed.')
        return
      }
      router.replace('/mail-merge')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const field =
    'w-full h-11 border bg-white rounded-lg pl-10 pr-3 text-sm text-navy placeholder:text-navy/45 transition-shadow hover:border-navy/25 focus:outline-none focus:border-orange focus:shadow-glow aria-[invalid=true]:border-red-400'

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] bg-canvas">
      <section className="relative hidden lg:flex flex-col overflow-clip bg-navy text-white px-12 xl:px-16 py-12">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(255,117,31,0.14),transparent_70%)]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_0%_0%,black,transparent)]"
          aria-hidden="true"
        />

        <div className="relative bg-white inline-flex self-start px-3 py-2 rounded-lg">
          <img src="/brand/charantra-logo.png" alt="Charantra" className="h-14 w-auto" />
        </div>

        <div className="relative my-auto py-8 w-full max-w-[540px]">
          <p className="text-sm font-semibold text-orange">Mail merge</p>
          <h1 className="mt-3 text-[44px] xl:text-5xl font-bold leading-[1.05] tracking-tight">
            Personalized outreach.
            <br />
            At scale.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/70 max-w-md">
            Prepare one message and personalize it for every investor using your spreadsheet.
          </p>
          <ol className="mt-8 grid gap-3">
            {STEPS.map((item, i) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/85">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/25 text-[11px] font-bold tabular-nums">{i + 1}</span>
                {item}
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <SamplePreview />
          </div>
        </div>

        <p className="relative text-xs text-white/55 max-w-md">
          Your spreadsheet is read in the browser and is not uploaded. Finished emails are sent through Outlook and logged for the reply tracker.
        </p>
      </section>

      <section className="min-h-screen lg:min-h-0 flex items-center justify-center px-5 sm:px-8 py-12">
        <form onSubmit={handleSubmit} aria-busy={loading} className="w-full max-w-[400px]">
          <img src="/brand/charantra-logo.png" alt="Charantra" className="h-12 w-auto mb-10 lg:hidden" />
          <h2 className="text-[28px] font-bold text-navy tracking-tight leading-tight">Welcome back</h2>
          <p className="text-sm text-navy/65 mt-2 mb-8">Sign in to prepare, review and send a merge.</p>

          <label htmlFor="email" className="block text-sm font-semibold text-navy mb-1.5">
            Work email
          </label>
          <div className="relative">
            <Icon name="at" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy/45 pointer-events-none" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@charantra.ai"
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : 'login-help'}
              className={`${field} border-line`}
            />
          </div>

          <label htmlFor="password" className="block text-sm font-semibold text-navy mb-1.5 mt-5">
            Password
          </label>
          <div className="relative">
            <Icon name="lock" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy/45 pointer-events-none" />
            <input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              className={`${field} border-line pr-16`}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              aria-pressed={show}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 text-xs font-semibold text-navy/65 hover:text-navy hover:bg-navy/[0.05] rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <p id="login-error" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mt-5" role="alert">
              <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-7 inline-flex items-center justify-center gap-2 bg-orange hover:bg-orange-deep disabled:opacity-60 disabled:cursor-wait text-navy text-[15px] font-semibold rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            {loading && <span className="h-4 w-4 rounded-full border-2 border-navy/30 border-t-navy animate-spin" aria-hidden="true" />}
            {loading ? 'Signing in' : 'Sign in'}
          </button>
          <p id="login-help" className="text-[13px] text-navy/60 mt-6 text-center">
            Access is limited to authorized Charantra email addresses.
          </p>
        </form>
      </section>
    </div>
  )
}

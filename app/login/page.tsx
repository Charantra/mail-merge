'use client'

import { useEffect, useState } from 'react'
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

const ERRORS: Record<string, string> = {
  domain: 'That Microsoft account is not a Charantra address.',
  redirect: 'Microsoft sign-in is not registered for this site yet. Add /api/auth/microsoft/callback to the Azure app.',
  denied: 'Microsoft sign-in was cancelled.',
  config: 'Microsoft sign-in is not configured on this server.',
  state: 'Sign-in expired. Try again.',
  failed: 'Microsoft did not complete sign-in. Try again.',
}

export default function LoginPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error') || ''
    setError(ERRORS[code] || (code ? ERRORS.failed : ''))
  }, [])

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
        <div className="w-full max-w-[400px]">
          <img src="/brand/charantra-logo.png" alt="Charantra" className="h-12 w-auto mb-10 lg:hidden" />
          <h2 className="text-[28px] font-bold text-navy tracking-tight leading-tight">Welcome back</h2>
          <p className="text-sm text-navy/65 mt-2 mb-8">Sign in with your Charantra Microsoft account.</p>

          {error && (
            <p id="login-error" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-5" role="alert">
              <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
              {error}
            </p>
          )}

          <a
            href="/api/auth/microsoft"
            className="w-full h-11 inline-flex items-center justify-center gap-2.5 bg-orange hover:bg-orange-deep text-navy text-[15px] font-semibold rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <path fill="#f25022" d="M1 1h9v9H1z" />
              <path fill="#7fba00" d="M11 1h9v9h-9z" />
              <path fill="#00a4ef" d="M1 11h9v9H1z" />
              <path fill="#ffb900" d="M11 11h9v9h-9z" />
            </svg>
            Sign in with Microsoft
          </a>
          <p id="login-help" className="text-[13px] text-navy/60 mt-6 text-center">
            Access is limited to authorized Charantra email addresses.
          </p>
        </div>
      </section>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toCsv } from '@/mail-merge'
import { download } from '@/mail-merge/ui/kit'

type Run = {
  id: string
  name: string
  subject: string
  mailbox: string
  tracking: boolean
  created_by: string
  created_at: string
  sent: number
  failed: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

type Msg = {
  id: string
  record: number | null
  to_email: string
  subject: string
  status: 'sending' | 'sent' | 'failed' | 'unknown'
  error: string | null
  sent_at: string | null
  tracking: boolean
  open_count: number
  machine_open_count: number
  first_opened_at: string | null
  last_opened_at: string | null
  click_count: number
  machine_click_count: number
  first_clicked_at: string | null
  clicked_urls: string[]
  replied_at: string | null
  reply_from: string | null
  reply_snippet: string | null
  reply_count: number
  auto_reply_at: string | null
  bounced_at: string | null
  bounce_reason: string | null
  checked_at: string | null
}

const FILTERS = ['All', 'Opened', 'Not opened', 'Clicked', 'Replied', 'No reply', 'Bounced', 'Failed'] as const
type Filter = (typeof FILTERS)[number]

function when(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function pct(n: number, of: number): string {
  return of ? `${Math.round((n / of) * 100)}%` : '-'
}

/** Furthest point each email reached, for the Stage column. */
function stage(m: Msg): { label: string; tone: string } {
  if (m.status === 'failed') return { label: 'Not sent', tone: 'bg-red-50 text-red-700' }
  if (m.status === 'sending' || m.status === 'unknown') return { label: 'Unconfirmed', tone: 'bg-amber-50 text-amber-800' }
  if (m.bounced_at) return { label: 'Bounced', tone: 'bg-red-50 text-red-700' }
  if (m.replied_at) return { label: 'Replied', tone: 'bg-emerald-100 text-emerald-800' }
  if (m.click_count > 0) return { label: 'Clicked', tone: 'bg-sky-100 text-sky-800' }
  if (m.first_opened_at) return { label: 'Opened', tone: 'bg-sky-50 text-sky-700' }
  return { label: 'Sent', tone: 'bg-slate-100 text-slate-700' }
}

function matches(m: Msg, f: Filter): boolean {
  switch (f) {
    case 'All': return true
    case 'Opened': return !!m.first_opened_at
    case 'Not opened': return m.status === 'sent' && !m.first_opened_at
    case 'Clicked': return m.click_count > 0
    case 'Replied': return !!m.replied_at
    case 'No reply': return m.status === 'sent' && !m.replied_at && !m.bounced_at
    case 'Bounced': return !!m.bounced_at
    case 'Failed': return m.status === 'failed' || m.status === 'unknown'
  }
}

export default function MailMergeTrackerPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [trackingOn, setTrackingOn] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [filter, setFilter] = useState<Filter>('All')
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/mail-merge/tracker', { cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return setError(j.error || 'Could not load the tracker')
    setError(null)
    setRuns(j.runs || [])
    setTrackingOn(!!j.tracking)
    setRunId(id => id ?? j.runs?.[0]?.id ?? null)
  }, [])

  const checkReplies = useCallback(
    async (id: string) => {
      setChecking(true)
      setNote(null)
      try {
        const res = await fetch(`/api/mail-merge/tracker/${encodeURIComponent(id)}`, { method: 'POST' })
        const j = await res.json().catch(() => ({}))
        if (j.messages) setMessages(j.messages)
        const c = j.check || {}
        if (c.error) setNote(`Could not read Outlook: ${c.error}`)
        else if (c.errors?.length) setNote(`Checked ${c.checked}. ${c.errors.length} could not be read: ${c.errors[0]}`)
        else setNote(`Checked ${c.checked ?? 0} email${c.checked === 1 ? '' : 's'} in Outlook. ${c.replied ?? 0} new repl${c.replied === 1 ? 'y' : 'ies'}, ${c.bounced ?? 0} new bounce${c.bounced === 1 ? '' : 's'}.`)
        await loadRuns()
      } finally {
        setChecking(false)
      }
    },
    [loadRuns],
  )

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  // Show the run straight away, then read Outlook for replies in the background.
  useEffect(() => {
    if (!runId) return
    setFilter('All')
    setNote(null)
    fetch(`/api/mail-merge/tracker/${encodeURIComponent(runId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setMessages(j.messages || []))
      .then(() => checkReplies(runId))
      .catch(() => {})
  }, [runId, checkReplies])

  // Opens and clicks arrive on their own; refresh them every 30 seconds while the page is open.
  useEffect(() => {
    if (!runId) return
    const t = setInterval(() => {
      fetch(`/api/mail-merge/tracker/${encodeURIComponent(runId)}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(j => j.messages && setMessages(j.messages))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [runId])

  const run = runs.find(r => r.id === runId) ?? null
  const shown = useMemo(() => messages.filter(m => matches(m, filter)), [messages, filter])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f, messages.filter(m => matches(m, f)).length])) as Record<Filter, number>, [messages])

  function exportCsv() {
    const rows = shown.map(m => ({
      'Record #': String(m.record ?? ''),
      To: m.to_email,
      Stage: stage(m).label,
      'Sent at': m.sent_at ?? '',
      'First opened': m.first_opened_at ?? '',
      Opens: String(m.open_count),
      Clicks: String(m.click_count),
      'Clicked links': m.clicked_urls.join(' '),
      'Replied at': m.replied_at ?? '',
      'Reply from': m.reply_from ?? '',
      Reply: m.reply_snippet ?? '',
      'Bounced at': m.bounced_at ?? '',
      'Auto reply at': m.auto_reply_at ?? '',
      Error: m.error ?? '',
    }))
    download(`${run?.name || 'mail-merge'} tracker.csv`.replace(/[<>:"/\\|?*]/g, '_'), toCsv(rows), 'text/csv;charset=utf-8')
  }

  return (
    <main className="px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mail merge tracker</h1>
          <p className="text-sm text-slate-500">Who was sent, who opened, who clicked, who replied. Separate from the outreach tracker.</p>
        </div>
        <Link href="/mail-merge" className="text-sm font-medium text-orange-600 hover:underline">
          Back to mail merge
        </Link>
      </div>

      {!trackingOn && (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Opens and clicks are not being tracked from this copy of the app: it is not on a public https address (APP_PUBLIC_URL), so the
          pixel and links inside emails would point nowhere. Emails sent from the deployed app are tracked. Replies and bounces are read from
          Outlook and work everywhere.
        </div>
      )}
      {error && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!error && !runs.length && <p className="text-sm text-slate-500">Nothing sent yet. Sends from the mail merge appear here.</p>}

      {runs.length > 0 && (
        <div className="bg-white border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Merge</th>
                <th className="px-3 py-2 text-left font-semibold">Subject</th>
                <th className="px-3 py-2 text-right font-semibold">Sent</th>
                <th className="px-3 py-2 text-right font-semibold">Opened</th>
                <th className="px-3 py-2 text-right font-semibold">Clicked</th>
                <th className="px-3 py-2 text-right font-semibold">Replied</th>
                <th className="px-3 py-2 text-right font-semibold">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setRunId(r.id)}
                  className={`border-t border-slate-100 cursor-pointer ${r.id === runId ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {when(r.created_at)} by {r.created_by}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 max-w-[320px] truncate">{r.subject}</td>
                  <td className="px-3 py-2 text-right">
                    {r.sent}
                    {r.failed > 0 && <span className="block text-xs text-red-600">{r.failed} failed</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.tracking ? (
                      <>
                        {r.opened} <span className="text-xs text-slate-400">{pct(r.opened, r.sent)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">not tracked</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.tracking ? (
                      <>
                        {r.clicked} <span className="text-xs text-slate-400">{pct(r.clicked, r.sent)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">not tracked</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.replied} <span className="text-xs text-slate-400">{pct(r.replied, r.sent)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run && (
        <section className="bg-white border border-slate-200">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{run.name}</h2>
              <p className="text-xs text-slate-500">
                From {run.mailbox} · {run.tracking ? 'opens and clicks tracked' : 'opens and clicks not tracked for this send'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void checkReplies(run.id)}
                disabled={checking}
                className="px-3 py-1.5 text-sm font-medium border border-orange-500 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {checking ? 'Checking Outlook...' : 'Check replies now'}
              </button>
              <button type="button" onClick={exportCsv} className="px-3 py-1.5 text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50">
                Export CSV
              </button>
            </div>
          </header>

          <div className="flex flex-wrap gap-1 px-4 pt-3">
            {FILTERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                {f} <span className="opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
          {note && <p className="px-4 pt-2 text-xs text-slate-500">{note}</p>}

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Recipient</th>
                  <th className="px-3 py-2 text-left font-semibold">Stage</th>
                  <th className="px-3 py-2 text-left font-semibold">Sent</th>
                  <th className="px-3 py-2 text-left font-semibold">Opened</th>
                  <th className="px-3 py-2 text-left font-semibold">Clicked</th>
                  <th className="px-3 py-2 text-left font-semibold">Reply</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(m => {
                  const s = stage(m)
                  return (
                    <tr key={m.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 text-xs text-slate-400">{m.record}</td>
                      <td className="px-3 py-2 text-slate-900 break-all">
                        {m.to_email}
                        {m.error && <span className="block text-xs text-red-600">{m.error}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>
                        {m.auto_reply_at && <span className="block text-[11px] text-slate-500 mt-0.5">Out-of-office {when(m.auto_reply_at)}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{when(m.sent_at)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {!m.tracking ? (
                          <span className="text-slate-400">not tracked</span>
                        ) : m.first_opened_at ? (
                          <>
                            {when(m.first_opened_at)}
                            {m.open_count > 1 && <span className="block text-slate-400">{m.open_count} opens, last {when(m.last_opened_at)}</span>}
                          </>
                        ) : m.machine_open_count > 0 ? (
                          <span className="text-slate-400" title="Fetched by a mail scanner or preview, not counted as a person">scanner only</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {!m.tracking ? (
                          <span className="text-slate-400">not tracked</span>
                        ) : m.click_count > 0 ? (
                          <>
                            {when(m.first_clicked_at)} · {m.click_count}x
                            {m.clicked_urls.map(u => (
                              <span key={u} className="block text-slate-400 truncate max-w-[220px]" title={u}>
                                {u.replace(/^https?:\/\//, '')}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 max-w-[360px]">
                        {m.bounced_at ? (
                          <span className="text-red-700">
                            Bounced {when(m.bounced_at)}
                            {m.bounce_reason && <span className="block text-slate-500 truncate">{m.bounce_reason}</span>}
                          </span>
                        ) : m.replied_at ? (
                          <>
                            <span className="font-medium text-emerald-800">
                              {when(m.replied_at)}
                              {m.reply_count > 1 && ` · ${m.reply_count} replies`}
                            </span>
                            {m.reply_snippet && <span className="block text-slate-500 line-clamp-2">{m.reply_snippet}</span>}
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!shown.length && <p className="px-4 py-6 text-sm text-slate-500 text-center">No emails in this view.</p>}
          </div>
        </section>
      )}
    </main>
  )
}

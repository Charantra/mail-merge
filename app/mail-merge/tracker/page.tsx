'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toCsv } from '@/mail-merge'
import { Avatar, Badge, Button, Icon, Notice, Segmented, download, type IconName } from '@/mail-merge/ui/kit'
import { Shell } from '@/mail-merge/ui/Shell'

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
function stage(m: Msg): { label: string; tone: 'slate' | 'red' | 'amber' | 'green' | 'blue' | 'orange' } {
  if (m.status === 'failed') return { label: 'Not sent', tone: 'red' }
  if (m.status === 'sending' || m.status === 'unknown') return { label: 'Unconfirmed', tone: 'amber' }
  if (m.bounced_at) return { label: 'Bounced', tone: 'red' }
  if (m.replied_at) return { label: 'Replied', tone: 'green' }
  if (m.click_count > 0) return { label: 'Clicked', tone: 'orange' }
  if (m.first_opened_at) return { label: 'Opened', tone: 'blue' }
  return { label: 'Sent', tone: 'slate' }
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

  const kpis: { label: string; value: number; icon: IconName; tone: string; bar: string; tracked: boolean }[] = run
    ? [
        { label: 'Opened', value: run.opened, icon: 'eye', tone: 'text-sky-600 bg-sky-50', bar: 'bg-sky-500', tracked: run.tracking },
        { label: 'Clicked', value: run.clicked, icon: 'pointer', tone: 'text-violet-600 bg-violet-50', bar: 'bg-violet-500', tracked: run.tracking },
        { label: 'Replied', value: run.replied, icon: 'reply', tone: 'text-emerald-600 bg-emerald-50', bar: 'bg-emerald-500', tracked: true },
        { label: 'Bounced', value: run.bounced, icon: 'bounce', tone: 'text-red-600 bg-red-50', bar: 'bg-red-500', tracked: true },
      ]
    : []

  return (
    <Shell>
      <main className="flex-1 w-full max-w-[1480px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-orange-700">After the send</p>
            <h1 className="text-[26px] sm:text-[30px] font-bold text-navy tracking-tight leading-tight mt-1.5">Who opened, clicked, replied</h1>
            <p className="text-[15px] text-navy/60 mt-1.5 max-w-2xl">Pick a send. Opens and clicks refresh on their own. Replies update when you check Outlook.</p>
          </div>
          <Link
            href="/mail-merge"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange text-navy text-sm font-semibold hover:bg-orange-deep transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <Icon name="plus" size={16} />
            New merge
          </Link>
        </header>

        {!trackingOn && (
          <Notice tone="amber">
            Opens and clicks are not being tracked from this copy of the app: it is not on a public https address (APP_PUBLIC_URL), so the pixel and links
            inside emails would point nowhere. Emails sent from the deployed app are tracked. Replies and bounces are read from Outlook and work everywhere.
          </Notice>
        )}
        {error && <Notice tone="red">{error}</Notice>}

        {!error && !runs.length && (
          <div className="bg-white border border-line rounded-2xl shadow-card px-6 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-700">
              <Icon name="inbox" size={26} />
            </span>
            <p className="text-lg font-bold text-navy mt-4">Nothing sent yet</p>
            <p className="text-sm text-navy/55 mt-1">Send the first list, then come back here to see who replied.</p>
            <Link href="/mail-merge" className="inline-flex items-center gap-2 mt-6 h-10 px-4 rounded-xl bg-orange hover:bg-orange-deep text-navy text-sm font-semibold">
              Start a merge
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        )}

        {runs.length > 0 && (
          <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] items-start">
            <aside className="bg-white border border-line rounded-2xl shadow-card overflow-hidden xl:sticky xl:top-24">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">Sends</h2>
                <span className="text-xs text-navy/45 tabular-nums">{runs.length}</span>
              </div>
              <ul className="p-1.5 max-h-[calc(100vh-15rem)] overflow-y-auto scroll-thin">
                {runs.map(r => {
                  const on = r.id === runId
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setRunId(r.id)}
                        aria-current={on ? 'true' : undefined}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${
                          on ? 'bg-orange-50 ring-1 ring-inset ring-orange-300/60' : 'hover:bg-canvas'
                        }`}
                      >
                        <span className="block text-[13px] font-bold text-navy truncate">{r.name}</span>
                        <span className="block text-xs text-navy/55 truncate mt-0.5">{r.subject}</span>
                        <span className="flex items-center gap-3 mt-2 text-[11px] text-navy/50 tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="send" size={11} />
                            {r.sent}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="reply" size={11} />
                            {r.replied}
                          </span>
                          {r.failed > 0 && <span className="text-red-600">{r.failed} failed</span>}
                          <span className="ml-auto">{when(r.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {run && (
              <section className="space-y-4 min-w-0">
                <div className="bg-white border border-line rounded-2xl shadow-card p-5 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[14rem]">
                    <h2 className="text-lg font-bold text-navy tracking-tight truncate">{run.name}</h2>
                    <p className="text-sm text-navy/55 mt-0.5 truncate">{run.subject}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <Badge>From {run.mailbox}</Badge>
                      <Badge>By {run.created_by}</Badge>
                      <Badge tone={run.tracking ? 'blue' : 'slate'} dot>
                        {run.tracking ? 'Opens and clicks tracked' : 'Opens and clicks not tracked'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="primary" onClick={() => void checkReplies(run.id)} disabled={checking}>
                      <Icon name="refresh" size={15} className={checking ? 'animate-spin' : ''} />
                      {checking ? 'Checking Outlook' : 'Check replies now'}
                    </Button>
                    <Button onClick={exportCsv}>
                      <Icon name="download" size={15} />
                      Export CSV
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                  <div className="bg-navy text-white rounded-2xl shadow-card px-4 py-3.5 col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">Sent</span>
                      <Icon name="send" size={15} className="text-orange" />
                    </div>
                    <div className="text-2xl font-bold tabular-nums mt-1.5">{run.sent}</div>
                    <div className="text-[11px] text-white/50 mt-0.5">{run.failed > 0 ? `${run.failed} failed` : 'none failed'}</div>
                  </div>
                  {kpis.map(k => {
                    const share = run.sent ? k.value / run.sent : 0
                    return (
                      <div key={k.label} className="bg-white border border-line rounded-2xl shadow-card px-4 py-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-navy/55">{k.label}</span>
                          <span className={`grid h-7 w-7 place-items-center rounded-lg ${k.tone}`}>
                            <Icon name={k.icon} size={14} />
                          </span>
                        </div>
                        {k.tracked ? (
                          <>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className="text-2xl font-bold text-navy tabular-nums">{k.value}</span>
                              <span className="text-xs text-navy/45 tabular-nums">{pct(k.value, run.sent)}</span>
                            </div>
                            <div className="mt-2 h-1 rounded-full bg-navy/[0.07] overflow-hidden" aria-hidden="true">
                              <div className={`h-full rounded-full ${k.bar} transition-[width] duration-700`} style={{ width: `${share * 100}%` }} />
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-navy/40 mt-2">Not tracked</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="bg-white border border-line rounded-2xl shadow-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
                    <Segmented size="sm" value={filter} onChange={setFilter} options={FILTERS.map(f => ({ value: f, label: f, count: counts[f] }))} />
                    {note && (
                      <p className="flex items-center gap-1.5 text-xs text-navy/55">
                        <Icon name="info" size={13} />
                        {note}
                      </p>
                    )}
                  </div>

                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-canvas/70">
                          {['#', 'Recipient', 'Stage', 'Sent', 'Opened', 'Clicked', 'Reply'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-navy/50 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map(m => {
                          const s = stage(m)
                          return (
                            <tr key={m.id} className="border-t border-line align-top hover:bg-orange-50/30 transition-colors">
                              <td className="px-4 py-3 text-[11px] text-navy/35 tabular-nums">{m.record}</td>
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-2.5">
                                  <Avatar text={m.to_email} size={28} />
                                  <span className="min-w-0">
                                    <span className="block font-semibold text-navy break-all">{m.to_email}</span>
                                    {m.error && <span className="block text-xs text-red-600">{m.error}</span>}
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={s.tone} dot>
                                  {s.label}
                                </Badge>
                                {m.auto_reply_at && <span className="block text-[11px] text-navy/45 mt-1">Out of office {when(m.auto_reply_at)}</span>}
                              </td>
                              <td className="px-4 py-3 text-xs text-navy/60 whitespace-nowrap">{when(m.sent_at)}</td>
                              <td className="px-4 py-3 text-xs text-navy/60 whitespace-nowrap">
                                {!m.tracking ? (
                                  <span className="text-navy/35">not tracked</span>
                                ) : m.first_opened_at ? (
                                  <>
                                    {when(m.first_opened_at)}
                                    {m.open_count > 1 && <span className="block text-navy/40">{m.open_count} opens, last {when(m.last_opened_at)}</span>}
                                  </>
                                ) : m.machine_open_count > 0 ? (
                                  <span className="text-navy/40" title="Fetched by a mail scanner or preview, not counted as a person">
                                    scanner only
                                  </span>
                                ) : (
                                  <span className="text-navy/25">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-navy/60">
                                {!m.tracking ? (
                                  <span className="text-navy/35">not tracked</span>
                                ) : m.click_count > 0 ? (
                                  <>
                                    {when(m.first_clicked_at)} · {m.click_count}x
                                    {m.clicked_urls.map(u => (
                                      <span key={u} className="block text-navy/40 truncate max-w-[220px]" title={u}>
                                        {u.replace(/^https?:\/\//, '')}
                                      </span>
                                    ))}
                                  </>
                                ) : (
                                  <span className="text-navy/25">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-navy/70 max-w-[360px]">
                                {m.bounced_at ? (
                                  <span className="text-red-700">
                                    Bounced {when(m.bounced_at)}
                                    {m.bounce_reason && <span className="block text-navy/50 truncate">{m.bounce_reason}</span>}
                                  </span>
                                ) : m.replied_at ? (
                                  <span className="block rounded-lg bg-emerald-50/70 border border-emerald-100 px-2.5 py-1.5">
                                    <span className="font-semibold text-emerald-800">
                                      {when(m.replied_at)}
                                      {m.reply_count > 1 && ` · ${m.reply_count} replies`}
                                    </span>
                                    {m.reply_snippet && <span className="block text-navy/60 line-clamp-2 mt-0.5">{m.reply_snippet}</span>}
                                  </span>
                                ) : (
                                  <span className="text-navy/25">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {!shown.length && (
                      <div className="px-4 py-12 text-center">
                        <Icon name="inbox" size={24} className="mx-auto text-navy/25" />
                        <p className="text-sm text-navy/55 mt-2">No emails in this view.</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </Shell>
  )
}

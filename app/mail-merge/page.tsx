'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MailMerge, base64, type SendHandler, type SendResult } from '@/mail-merge'

const BATCH = 20

/**
 * Mail merge sending through the Outlook mailbox (Microsoft Graph).
 * Messages go to /api/mail-merge/send in batches of 20; each batch has its own
 * Idempotency-Key, kept across a retry, so a batch is never sent twice.
 */
const sendViaOutlook: SendHandler = async (messages, onProgress, meta) => {
  const results: SendResult[] = []
  // One run per press of Send; the tracker groups its emails under it.
  const run = { id: crypto.randomUUID(), name: `${meta.name} ${new Date().toLocaleString()}` }
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    const key = crypto.randomUUID()
    const payload = JSON.stringify({
      run,
      from: meta.from,
      messages: batch.map(m => ({
        index: m.index,
        to: m.to,
        cc: m.cc,
        bcc: m.bcc,
        subject: m.subject,
        body: m.body,
        format: m.format,
        attachments: m.files.map(f => ({ name: f.name, mime_type: f.type, content: base64(f.bytes) })),
      })),
    })
    let res: Response | null = null
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      try {
        res = await fetch('/api/mail-merge/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: payload,
        })
      } catch {
        // Network drop: retry once with the same key. The server replays instead of resending.
      }
    }
    const json = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok && Array.isArray(json.results)) {
      results.push(...json.results)
    } else {
      const message = json.error || 'No response from the server. Check Sent Items before resending.'
      const status = res && res.status < 500 ? 'failed' : 'unknown'
      results.push(...batch.map(m => ({ index: m.index, status, message }) as SendResult))
      onProgress(Math.min(i + BATCH, messages.length), messages.length)
      break
    }
    onProgress(Math.min(i + BATCH, messages.length), messages.length)
  }
  return results
}

export default function MailMergePage() {
  const [me, setMe] = useState<string | undefined>()
  const [senders, setSenders] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/mail-merge/send')
      .then(r => r.json())
      .then(j => {
        setMe(j.me || undefined)
        setSenders(j.senders || [])
      })
      .catch(() => {})
  }, [])

  return (
    <main className="px-6 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900">Mail merge</h1>
        <Link href="/mail-merge/tracker" className="text-sm font-medium text-orange-600 hover:underline">
          Tracker: opens, clicks, replies
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-5">Personalise one email for every row of a spreadsheet, then send it from Outlook.</p>
      <MailMerge onSend={sendViaOutlook} sendFrom={me} senders={senders} />
    </main>
  )
}

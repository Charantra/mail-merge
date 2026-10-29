import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/mailMergeStore'
import { trackingBase } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

/** GET /api/mail-merge/tracker: every mail merge run with sent, opened, clicked, replied and bounced counts. */
export async function GET() {
  try {
    return NextResponse.json({ runs: await listRuns(), tracking: trackingBase() !== null })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/mail_merge_/.test(message)) return NextResponse.json({ error: 'Run npm run db:migrate to set up mail merge tracking.' }, { status: 409 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

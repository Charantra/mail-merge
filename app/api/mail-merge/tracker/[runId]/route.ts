import { NextResponse } from 'next/server'
import { checkReplies, messagesForRun } from '@/lib/mailMergeStore'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** GET: one run's emails with their open, click, reply and bounce state. */
export async function GET(_req: Request, ctx: { params: { runId: string } }) {
  return NextResponse.json({ messages: await messagesForRun(ctx.params.runId) })
}

/** POST: read Outlook for replies and bounces to this run's emails (read only), then return the run. */
export async function POST(_req: Request, ctx: { params: { runId: string } }) {
  let check
  try {
    check = await checkReplies(ctx.params.runId)
  } catch (err) {
    check = { error: err instanceof Error ? err.message : String(err) }
  }
  return NextResponse.json({ check, messages: await messagesForRun(ctx.params.runId) })
}

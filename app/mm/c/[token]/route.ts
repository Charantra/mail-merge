import { NextRequest, NextResponse } from 'next/server'
import { readToken, looksLikeMachine } from '@/lib/tracking'
import { recordClick, sentAt } from '@/lib/mailMergeStore'

export const dynamic = 'force-dynamic'

/**
 * Click link for mail merge emails. Records the click, then redirects to the URL signed
 * into the token, never to anything taken from the query string.
 */
export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  const p = readToken(decodeURIComponent(ctx.params.token))
  if (!p?.u || !p.o.startsWith('mm_')) return new NextResponse('Link not found', { status: 404 })
  try {
    const at = await sentAt(p.o)
    if (at) {
      const since = (Date.now() - new Date(at).getTime()) / 1000
      await recordClick(p.o, p.u, looksLikeMachine(req.headers.get('user-agent') || '', Number.isFinite(since) ? since : null))
    }
  } catch {
    /* the reader still reaches the page */
  }
  return NextResponse.redirect(p.u, 302)
}

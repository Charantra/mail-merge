import { NextRequest } from 'next/server'
import { readToken, looksLikeMachine } from '@/lib/tracking'
import { recordOpen, sentAt } from '@/lib/mailMergeStore'

export const dynamic = 'force-dynamic'

// 1x1 transparent GIF.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function pixel() {
  return new Response(GIF, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  })
}

/** Open pixel for mail merge emails. Public by design; the token is signed. Always returns the image. */
export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  const p = readToken(decodeURIComponent(ctx.params.token))
  if (!p || !p.o.startsWith('mm_')) return pixel()
  try {
    const at = await sentAt(p.o)
    if (at) {
      const since = (Date.now() - new Date(at).getTime()) / 1000
      await recordOpen(p.o, looksLikeMachine(req.headers.get('user-agent') || '', Number.isFinite(since) ? since : null))
    }
  } catch {
    /* tracking must never break the image */
  }
  return pixel()
}

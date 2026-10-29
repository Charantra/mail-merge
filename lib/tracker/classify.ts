/**
 * Outreach tracker: fold a mailbox thread into a stage, a response, and a next action.
 * Rules are deterministic so a cache rebuild cannot drift.
 */

export const INBOUND_CLASSES = ['Bounced', 'OOO', 'Negative', 'Positive', 'Neutral'] as const
export type InboundClass = (typeof INBOUND_CLASSES)[number]

export const DEAL_STAGES = [
  'Not Contacted',
  'Teaser Sent',
  'Follow-up 1 Done',
  'Follow-up 2 Done',
  'In Conversation',
  'Meeting Scheduled',
  'Passed',
] as const
export type DealStage = (typeof DEAL_STAGES)[number]

export const RESPONSES = [
  'No Response',
  'OOO',
  'Bounced',
  'Neutral',
  'Positive',
  'Negative',
  'Pending',
] as const
export type OverallResponse = (typeof RESPONSES)[number]

export const KPI_KEYS = [
  'total',
  'notout',
  'outreached',
  'out1',
  'out2',
  'out3',
  'resp',
  'pos',
  'pass',
  'parked',
  'pending',
  'meeting',
  'noresp',
  'due',
] as const
export type KpiKey = (typeof KPI_KEYS)[number]

export const NEXT_ACTIONS = [
  'First send',
  'Follow-up 1 due',
  'Follow-up 2 due',
  'Last touch or park',
  'Our turn',
  'Wait for return',
  'Prepare meeting',
  'Closed',
  'Fix email',
  'Watch',
] as const
export type NextAction = (typeof NEXT_ACTIONS)[number]

export type ThreadEvent = {
  direction: 'sent' | 'received'
  occurredAt: string
  subject: string
  preview: string
  classification?: InboundClass | null
  emailType?: string
}

export type ThreadRollup = {
  stage: DealStage
  response: OverallResponse
  firstOutreach: string | null
  followup1: string | null
  followup2: string | null
  lastContact: string | null
  outreachCount: number
  bounced: boolean
  ooo: boolean
  hasReply: boolean
  silentDays: number | null
  nextAction: NextAction
  note: string
  kpi: Exclude<KpiKey, 'total' | 'outreached' | 'resp' | 'due'>
}

const INTERNAL_DOMAINS = ['charantra.ai', 'microsoft.com', 'office365.com', 'microsoftonline.com']
const SKIP_PREFIXES = [
  'mailer-daemon',
  'postmaster',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'bounce',
  'auto-reply',
  'automated',
]

const FOLLOWUP_1_AFTER_DAYS = 5
const FOLLOWUP_2_AFTER_DAYS = 7

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return true
  const e = email.toLowerCase().trim()
  if (!e.includes('@')) return true
  const [prefix, domain] = e.split('@')
  if (!prefix || !domain) return true
  if (SKIP_PREFIXES.some(p => prefix.startsWith(p))) return true
  return INTERNAL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))
}

export function classifyInbound(subject: string, preview: string): InboundClass {
  const txt = `${subject || ''} ${preview || ''}`
  if (
    /undeliverable|delivery.{0,15}fail|couldn.t be delivered|delivery status notification|failed to deliver|message not delivered|returned to sender|bounce/i.test(
      txt,
    )
  ) {
    return 'Bounced'
  }
  if (
    /automatic reply|out of office|\booo\b|on leave|away from (?:office|desk)|will be (?:back|out|away)|currently (?:out|away|unavailable)|annual leave|on vacation|on holiday/i.test(
      txt,
    )
  ) {
    return 'OOO'
  }
  if (
    /not interested|not something we|not a fit|pass on this|not the right fit|no thank you|not for us|not (?:in )?our (?:focus|mandate|thesis|portfolio|strategy)|not pursuing|won.t be pursuing|not moving forward|we.ll (?:pass|decline)|at this (point|time).*(?:pass|decline|not)/i.test(
      txt,
    )
  ) {
    return 'Negative'
  }
  if (
    /(?:happy|glad|love|great|excited|interested)\s+to\s+(?:chat|connect|discuss|explore|learn|hear|see|talk|meet)|let.s (?:set up|schedule|connect|talk|chat|discuss)|please (?:send|share|connect)|when (?:can|are) you available|schedule a (?:call|meeting)|set up a (?:call|meeting|time)|worth (?:exploring|discussing|a chat|connecting)/i.test(
      txt,
    )
  ) {
    return 'Positive'
  }
  return 'Neutral'
}

export function dayStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

export function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`)
  const b = Date.parse(`${toDay}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function todayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function fmtIn(d: string | null): string {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function generateEmailNote(input: {
  deal: string
  firstOutreach: string | null
  outreachDates: string[]
  bounced: boolean
  response: OverallResponse
}): string {
  const deal = input.deal || 'Investment'
  let note = deal
  if (input.firstOutreach) note += ` - First outreach ${fmtIn(input.firstOutreach)}.`
  const oc = input.outreachDates.length
  if (oc === 2) note += ` Follow-up sent ${fmtIn(input.outreachDates[1])}.`
  if (oc >= 3) {
    note += ` Follow-ups: ${fmtIn(input.outreachDates[1])} and ${fmtIn(input.outreachDates[oc - 1])} (${oc} total emails).`
  }
  if (input.bounced) note += ' Email bounced.'
  else if (input.response === 'Negative') note += ' PASSED.'
  else if (input.response === 'Positive') note += ' Positive response. In conversation.'
  else if (input.response === 'Neutral') note += ' Replied. Awaiting next steps.'
  else if (input.response === 'OOO') note += ' OOO reply received. Awaiting response.'
  else note += ' Awaiting response.'
  return note
}

export function nextActionFor(input: {
  bounced: boolean
  stage: DealStage
  response: OverallResponse
  hasReply: boolean
  outreachCount: number
  silentDays: number | null
}): NextAction {
  if (input.bounced) return 'Fix email'
  if (input.stage === 'Passed' || input.response === 'Negative') return 'Closed'
  if (input.stage === 'Meeting Scheduled') return 'Prepare meeting'
  if (input.response === 'OOO') return 'Wait for return'
  if (input.hasReply && (input.response === 'Positive' || input.response === 'Neutral' || input.response === 'Pending')) {
    return 'Our turn'
  }
  if (input.outreachCount === 0) return 'First send'
  const silent = input.silentDays ?? 0
  if (input.outreachCount === 1 && silent >= FOLLOWUP_1_AFTER_DAYS) return 'Follow-up 1 due'
  if (input.outreachCount === 2 && silent >= FOLLOWUP_2_AFTER_DAYS) return 'Follow-up 2 due'
  if (input.outreachCount >= 3 && silent >= FOLLOWUP_2_AFTER_DAYS) return 'Last touch or park'
  return 'Watch'
}

export function kpiBucket(stage: DealStage, response: OverallResponse): ThreadRollup['kpi'] {
  if (stage === 'Meeting Scheduled') return 'meeting'
  if (response === 'Positive') return 'pos'
  if (stage === 'Passed' || response === 'Negative') return 'pass'
  if (response === 'Neutral') return 'parked'
  if (response === 'Pending') return 'pending'
  if (response === 'No Response' || response === 'OOO' || response === 'Bounced') {
    if (stage === 'Follow-up 2 Done') return 'out3'
    if (stage === 'Follow-up 1 Done') return 'out2'
    if (stage === 'Teaser Sent') return 'out1'
    if (stage === 'Not Contacted') return 'notout'
    return 'noresp'
  }
  if (stage === 'Follow-up 2 Done') return 'out3'
  if (stage === 'Follow-up 1 Done') return 'out2'
  if (stage === 'Teaser Sent' || stage === 'In Conversation') return 'out1'
  return 'notout'
}

export function matchesKpi(kpi: KpiKey, row: { kpi: ThreadRollup['kpi']; nextAction: NextAction }): boolean {
  switch (kpi) {
    case 'total':
      return true
    case 'notout':
      return row.kpi === 'notout'
    case 'outreached':
      return row.kpi !== 'notout'
    case 'out1':
      return row.kpi === 'out1'
    case 'out2':
      return row.kpi === 'out2'
    case 'out3':
      return row.kpi === 'out3'
    case 'resp':
      return ['pos', 'pass', 'parked', 'pending', 'meeting'].includes(row.kpi)
    case 'pos':
      return row.kpi === 'pos'
    case 'pass':
      return row.kpi === 'pass'
    case 'parked':
      return row.kpi === 'parked'
    case 'pending':
      return row.kpi === 'pending'
    case 'meeting':
      return row.kpi === 'meeting'
    case 'noresp':
      return row.kpi === 'noresp' || row.kpi === 'out1' || row.kpi === 'out2' || row.kpi === 'out3'
    case 'due':
      return (
        row.nextAction === 'Follow-up 1 due' ||
        row.nextAction === 'Follow-up 2 due' ||
        row.nextAction === 'Last touch or park' ||
        row.nextAction === 'First send'
      )
    default: {
      const _never: never = kpi
      return _never
    }
  }
}

export function rollupThread(events: ThreadEvent[], deal: string, now = new Date()): ThreadRollup {
  const sentDays: string[] = []
  let firstOutreach: string | null = null
  let lastContact: string | null = null
  let bounced = false
  let ooo = false
  let hasReply = false
  let response: OverallResponse = 'No Response'
  let stage: DealStage = 'Not Contacted'
  let lastSent: string | null = null
  let lastRealReply: string | null = null

  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  for (const ev of sorted) {
    const day = dayStamp(ev.occurredAt)
    if (day) {
      if (!firstOutreach || day < firstOutreach) firstOutreach = day
      if (!lastContact || day > lastContact) lastContact = day
    }
    if (ev.direction === 'sent') {
      if (day && !sentDays.includes(day)) sentDays.push(day)
      if (day && (!lastSent || day > lastSent)) lastSent = day
      continue
    }
    const cls = ev.classification || classifyInbound(ev.subject, ev.preview)
    if (cls === 'Bounced') {
      bounced = true
      continue
    }
    if (cls === 'OOO') {
      ooo = true
      if (!hasReply) response = 'OOO'
      continue
    }
    hasReply = true
    if (day && (!lastRealReply || day > lastRealReply)) lastRealReply = day
    if (cls === 'Negative') {
      response = 'Negative'
      stage = 'Passed'
    } else if (cls === 'Positive') {
      response = 'Positive'
      if (stage !== 'Passed') stage = 'In Conversation'
    } else {
      if (!response || response === 'OOO' || response === 'No Response') response = 'Neutral'
      if (stage !== 'Passed') stage = 'In Conversation'
    }
  }

  sentDays.sort()
  const outreachCount = sentDays.length

  if (bounced) {
    stage = 'Not Contacted'
    response = 'Bounced'
  } else if (stage === 'Passed') {
    // keep
  } else if (hasReply) {
    if (stage === 'Not Contacted') stage = 'In Conversation'
    if (response === 'No Response') response = 'Neutral'
  } else {
    stage = outreachCount >= 3 ? 'Follow-up 2 Done' : outreachCount === 2 ? 'Follow-up 1 Done' : outreachCount === 1 ? 'Teaser Sent' : 'Not Contacted'
    if (response === 'No Response') response = ooo ? 'OOO' : 'No Response'
  }

  const today = todayStamp(now)
  let silentDays: number | null = null
  if (hasReply && lastRealReply) silentDays = daysBetween(lastRealReply, today)
  else if (lastSent) silentDays = daysBetween(lastSent, today)
  else if (lastContact) silentDays = daysBetween(lastContact, today)

  const nextAction = nextActionFor({
    bounced,
    stage,
    response,
    hasReply,
    outreachCount,
    silentDays,
  })

  return {
    stage,
    response,
    firstOutreach: sentDays[0] ?? firstOutreach,
    followup1: sentDays[1] ?? null,
    followup2: sentDays[2] ?? null,
    lastContact,
    outreachCount,
    bounced,
    ooo,
    hasReply,
    silentDays,
    nextAction,
    note: generateEmailNote({
      deal,
      firstOutreach: sentDays[0] ?? firstOutreach,
      outreachDates: sentDays,
      bounced,
      response,
    }),
    kpi: kpiBucket(stage, response),
  }
}

export function detectOwner(text: string): string {
  const t = text.toLowerCase()
  if (/\braghu\b/.test(t)) return 'Raghu'
  if (/\bshiv\b/.test(t)) return 'Shiv'
  if (/\bvinay\b/.test(t)) return 'Vinay'
  if (/\barun\b/.test(t)) return 'Arun'
  if (/cold\s*mail|cold\s*reach|cold\s*outreach/.test(t)) return 'Cold Mail'
  return ''
}

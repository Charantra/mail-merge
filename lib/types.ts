export type DataSource = 'attio' | 'notion' | 'zoho' | 'upload' | 'all' | 'match'

export type DealType = 'equity' | 'ma_sell' | 'ma_buy' | 'debt'

/** Where a company parameter came from. A tier is a fact; a confidence score is not. */
export type ParameterSourceTier = 'document' | 'client_stated' | 'inferred' | 'manual'

export interface CompanyParameter {
  /** Matches an id in lib/companyIntel PARAMETERS */
  parameter_id: string
  value: string
  source: string
  source_tier: ParameterSourceTier
  verified: boolean
  verified_by?: string | null
  verified_at?: string | null
}

/** A deal document held in SharePoint. Selected, not uploaded. */
export interface SessionDocument {
  drive_id: string
  item_id: string
  name: string
  kind: 'pitch_deck' | 'teaser' | 'memorandum' | 'financial_model' | 'valuation' | 'other'
}
export type WarmIntroStatus = 'Direct' | 'Warm' | 'Cold'
/** 1 priority, 2 strong fit, 3 possible fit, 4 low priority (do not approach now). */
export type MatchTier = 1 | 2 | 3 | 4

/**
 * One row of the match factor table.
 * `score` is null when we hold no data for the dimension. A null is displayed as
 * "not assessed" and is never treated as a zero, because absent data is not a bad score.
 */
export interface FactorScore {
  score: number | null
  /** Share of the total score this dimension carried. 0 means it did not move the number. */
  weight: number
  /** Why the score is what it is, in one line the analyst can check. */
  basis: string
}

export interface MatchFactors {
  sector: FactorScore
  ticket: FactorScore
  geography: FactorScore
  stage: FactorScore
  strategic_value: FactorScore
  recent_activity: FactorScore
  warmth: FactorScore
  business_model: FactorScore
  instrument: FactorScore
  /**
   * Holds the weight reserved for the dimensions above that we cannot assess.
   * Scored neutral, identically for everyone, so it shifts all totals equally
   * and never changes the ranking. Present so the factor table adds up to the
   * score rather than leaving an unexplained remainder.
   */
  unassessed_reserve: FactorScore
}

/** AI-written explanation. Grounded in retrieved fields, and never produces a score. */
export interface MatchExplanation {
  why: string
  concern: string
  approach: string
  generated_at: string
  model: string
}

export interface DealMatchProfile {
  deal_type: DealType
  sector: string
  /** Numeric amount in deal_size_unit */
  deal_size: number
  deal_size_unit: 'inr_cr' | 'usd_m'
  stage?: string
  markets?: string
  exclusions?: string
  /** Ranked client priorities, up to 3 */
  priorities?: string[]
}

export interface CompanyContext {
  name: string
  one_liner?: string
  description?: string
  traction?: string
  ask_amount?: string
  deck_link?: string
  founder_name?: string
  stage?: string
  sector?: string
  usp?: string
  website?: string
  notion_page_id?: string
  /** Full plain-text dump of the Notion page blocks — used as primary AI context for individual pages */
  raw_content?: string
}

export interface Contact {
  id: string
  name: string
  email: string
  firm?: string
  title?: string
  focus_areas?: string
  recent_investments?: string
  stage_preference?: string
  location?: string
  notes?: string
  source: DataSource
  mobile?: string
  match_score?: number
  match_tier?: MatchTier
  match_factors?: MatchFactors
  /** Tier the engine produced, kept when a human overrides the working tier. */
  ai_tier?: MatchTier
  explanation?: MatchExplanation
  warm_intro?: WarmIntroStatus
  contact_gap?: boolean
  fallback_email?: string
  match_rationale?: string
  in_zoho?: boolean
  in_master?: boolean
  contact_waterfall?: 'zoho' | 'master' | 'web'
  sheet_priority?: string
  outreach_owner?: string
}

export type OutreachStatus =
  | 'draft'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'replied'
export type FollowUpStatus = 'pending' | 'approved' | 'sent' | 'skipped'

export interface Session {
  id: string
  name: string
  company_tag: string
  /** Exact Notion memo page UUID — set when picking from Companies DB so context isn’t ambiguous title search */
  notion_company_page_id?: string | null
  source: DataSource
  created_at: string
  updated_at: string
  /** Why we are sending this outreach — the campaign goal, round details, target persona, etc.
   *  Injected into every AI email draft as the primary "why are we reaching out" context. */
  outreach_context?: string
  /** Skill 006 deal profile used by Run match. JSON in DB. */
  match_profile?: DealMatchProfile | null
  /** Session setup (step 1) */
  transaction_type?: DealType | null
  target_raise?: string | null
  target_investor_type?: string | null
  session_owner?: string | null
  team_members?: string | null
  /** SharePoint deal documents cited as parameter sources. */
  documents?: SessionDocument[] | null
  /** One subject line for every draft in this session (editable on Contacts tab). */
  email_subject?: string | null
  /** SharePoint teaser file (from SHAREPOINT_TEASERS_FOLDER_URL) — attached on send. */
  sharepoint_teaser_drive_id?: string | null
  sharepoint_teaser_item_id?: string | null
  sharepoint_teaser_name?: string | null
}

export interface OutreachRecord {
  id: string
  session_id: string
  contact_id: string
  contact_name: string
  contact_email: string
  contact_firm: string
  subject: string
  body_html: string
  hook: string
  status: OutreachStatus
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounced: boolean
  engagement: string
  last_synced: string | null
  attachments?: Attachment[]
  /** Returned by Zepto POST /v1.1/email — needed to read Processed Email / delivery timeline. */
  zepto_request_id?: string | null
  /** Zepto/UI delivery lane (Delivered, Hard bounce, Soft bounce, Processed…) after sync-from-Zepto. */
  delivery_status_display?: string | null
  /** Immutable Graph id of the first message sent from investments@. */
  graph_message_id?: string | null
  /** RFC Message-ID of that first message. */
  internet_message_id?: string | null
  /** Outlook conversation. Follow-ups reply inside this id. */
  conversation_id?: string | null
  /** Which provider sent it: ZeptoMail or Microsoft Graph. Null on rows sent before this existed. */
  provider?: 'zepto' | 'graph' | null
  campaign_id?: string | null
  batch_id?: string | null
  person_key?: string | null
  /** Graph sends only: carries the app's open pixel and click links. */
  tracking_enabled?: boolean
}

export interface Attachment {
  name: string
  content: string   // base64
  mime_type: string
}

export interface FollowUp {
  id: string
  outreach_id: string
  session_id: string
  contact_name: string
  contact_email: string
  contact_firm: string
  draft_subject: string
  draft_body: string
  follow_up_number: number  // 1-based index into FOLLOWUP_DAYS (default 5, 7)
  status: FollowUpStatus
  created_at: string
  sent_at: string | null
  days_since_original: number
  approval_status?: 'pending' | 'approved' | 'rejected'
  approved_by?: string | null
  rejection_reason?: string | null
  send_error?: string | null
  provider?: 'zepto' | 'graph' | null
}

export interface SessionStats {
  total: number
  sent: number
  opened: number
  clicked: number
  bounced: number
  replied: number
  pending_followups: number
  bounce_rate: number
}

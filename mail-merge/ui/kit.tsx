'use client'

/** Building blocks for the wizard and tracker. Navy is the text and chrome, orange is the forward action. */
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-orange text-navy font-semibold shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_1px_2px_rgba(197,85,18,0.35)] hover:bg-orange-deep hover:-translate-y-px active:translate-y-0 focus-visible:outline-navy',
  secondary: 'bg-white text-navy font-semibold border border-line shadow-card hover:border-navy/25 hover:bg-canvas focus-visible:outline-orange',
  ghost: 'text-navy/70 font-semibold hover:text-navy hover:bg-navy/[0.05] focus-visible:outline-orange',
  danger: 'bg-white text-red-700 font-semibold border border-red-200 hover:bg-red-50 hover:border-red-300 focus-visible:outline-red-700',
  dark: 'bg-navy text-white font-semibold hover:bg-navy-800 hover:-translate-y-px active:translate-y-0 focus-visible:outline-orange',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-[15px] rounded-xl gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Panel({
  title,
  icon,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title?: ReactNode
  icon?: IconName
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`bg-white border border-line rounded-2xl shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-700">
                <Icon name={icon} size={15} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-navy truncate">{title}</h3>
              {subtitle && <p className="text-xs text-navy/50 truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-navy/50 mb-1.5">
      {children}
      {hint && <span className="ml-1 normal-case tracking-normal font-normal text-navy/40">{hint}</span>}
    </span>
  )
}

export const inputClass =
  'w-full border border-line bg-white rounded-lg px-3 py-2 text-sm text-navy placeholder:text-navy/35 shadow-[0_1px_0_rgba(5,10,48,0.02)] transition-shadow hover:border-navy/20 focus:outline-none focus:border-orange focus:shadow-glow'

type Tone = 'slate' | 'red' | 'amber' | 'green' | 'blue' | 'orange'

const TONES: Record<Tone, string> = {
  slate: 'bg-navy/[0.05] text-navy/75 ring-navy/10',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-300/50',
}

const DOTS: Record<Tone, string> = {
  slate: 'bg-navy/40',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  orange: 'bg-orange',
}

export function Badge({ tone = 'slate', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap rounded-full ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  )
}

/** A row of mutually exclusive choices, like a macOS segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: readonly { value: T; label: ReactNode; count?: number }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap items-center gap-0.5 p-0.5 rounded-lg bg-navy/[0.05] ring-1 ring-inset ring-navy/[0.06]">
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-md font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]'
            } ${on ? 'bg-white text-navy shadow-card' : 'text-navy/55 hover:text-navy'}`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`tabular-nums text-[11px] px-1.5 rounded-full ${on ? 'bg-orange-50 text-orange-700' : 'bg-navy/[0.06] text-navy/50'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A big number with a caption, for summaries. */
export function Stat({ value, label, tone = 'navy', icon }: { value: ReactNode; label: ReactNode; tone?: 'navy' | 'green' | 'red' | 'amber' | 'orange'; icon?: IconName }) {
  const chip = { navy: 'bg-navy/[0.06] text-navy/70', green: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', orange: 'bg-orange-50 text-orange-700' }[tone]
  const colour = { navy: 'text-navy', green: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-600', orange: 'text-orange-700' }[tone]
  return (
    <div className="bg-white border border-line rounded-2xl shadow-card px-4 py-3.5 flex items-center gap-3.5">
      {icon && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${chip}`}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="min-w-0">
        <div className={`text-2xl font-bold leading-none tabular-nums ${colour}`}>{value}</div>
        <div className="text-xs text-navy/55 mt-1 truncate">{label}</div>
      </div>
    </div>
  )
}

export function Notice({ tone = 'amber', icon, children }: { tone?: 'amber' | 'red' | 'green' | 'blue'; icon?: IconName; children: ReactNode }) {
  const styles = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue: 'bg-sky-50 border-sky-200 text-sky-900',
  }[tone]
  const fallback: IconName = tone === 'green' ? 'check-circle' : tone === 'blue' ? 'info' : 'alert'
  return (
    <div className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-2.5 text-sm ${styles}`} role={tone === 'red' ? 'alert' : undefined}>
      <Icon name={icon ?? fallback} size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** An on/off toggle, like iOS. */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
        checked ? 'bg-orange' : 'bg-navy/20'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-5 min-w-[20px] justify-center px-1.5 rounded-md border border-navy/20 bg-navy/[0.06] font-sans text-[10px] font-semibold opacity-70">
      {children}
    </kbd>
  )
}

/** Initials in a coloured circle, picked from the text so the same person keeps the same colour. */
export function Avatar({ text, size = 32 }: { text: string; size?: number }) {
  const clean = text.replace(/@.*$/, '').replace(/[^a-zA-Z0-9 ._-]/g, '')
  const parts = clean.split(/[ ._-]+/).filter(Boolean)
  const initials = ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
  const palette = ['bg-orange-100 text-orange-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700']
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold ${palette[h % palette.length]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

/** A centred dialog. Escape and the backdrop close it. */
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-pop animate-scale-in">{children}</div>
    </div>
  )
}

export function download(name: string, data: BlobPart | Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PATHS = {
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  sheet: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M8 13h8M8 17h8M12 11v8',
  clipboard: 'M9 4h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 1h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m1 7h6m-6 4h4',
  sparkles: 'M12 3l1.8 4.6L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.9L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 9v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.15a3.5 3.5 0 0 1 0 6.7',
  search: 'm20 20-4.2-4.2M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z',
  sliders: 'M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M16 4v4M10 10v4M18 16v4',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  'check-circle': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12.5.5 2.5 2.5 5-5',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevrons-left': 'm11 7-5 5 5 5m7-10-5 5 5 5',
  'chevrons-right': 'm13 7 5 5-5 5M6 7l5 5-5 5',
  'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
  'arrow-left': 'M19 12H5m6 6-6-6 6-6',
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Zm-1 1 9 6 9-6',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4',
  download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  printer: 'M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z',
  table: 'M4 5h16v14H4V5Zm0 5h16M4 15h16M10 5v14',
  'file-text': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4',
  alert: 'M12 9v4m0 3.5v.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9.5v.01',
  paperclip: 'm20 11.5-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15 7',
  wand: 'M15 4V2m0 8V8m-4-1H9m12 0h-2m-1.2-3.8L16.4 4.6m0 4.8 1.4 1.4M3 21 14 10m-1.5-1.5 2 2',
  braces: 'M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1m8-18h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1',
  hash: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 5h16M8 3v4m8-4v4',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Zm-4 6H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  trash: 'M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4m-4 4h10',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z',
  pointer: 'm5 3 14 7-6 2-2 6-6-15Zm8 9 6 6',
  reply: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5',
  bounce: 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Zm4 5v5m0 3v.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  user: 'M18 20v-1a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4v1m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V7a4 4 0 1 1 8 0v4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  zap: 'M13 3 4 14h7l-1 7 9-11h-7l1-7Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, className = '', strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

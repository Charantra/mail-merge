'use client'

/** Small building blocks for the wizard. Plain Tailwind palette so the folder works in any app. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-orange-500 text-white hover:bg-orange-600 border border-orange-500',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 border border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border border-red-300',
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
      {children}
      {hint && <span className="ml-1 normal-case tracking-normal font-normal text-slate-400">{hint}</span>}
    </span>
  )
}

export const inputClass =
  'w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400'

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'red' | 'amber' | 'green'; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-800',
    green: 'bg-emerald-50 text-emerald-700',
  }
  return <span className={`inline-block px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>
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

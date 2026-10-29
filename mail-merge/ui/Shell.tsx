'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar, Icon, type IconName } from './kit'

const LINKS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: '/mail-merge', label: 'New merge', icon: 'mail' },
  { href: '/mail-merge/tracker', label: 'Tracker', icon: 'inbox' },
]

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [me, setMe] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/mail-merge/send')
      .then(r => r.json())
      .then(j => setMe(j.me || null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-line">
        <div className="px-4 sm:px-5 h-[72px] grid grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <Link href="/mail-merge" className="justify-self-start shrink-0 flex items-center gap-5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange">
            <img src="/brand/charantra-logo.png" alt="Charantra" className="h-12 w-auto" />
            <span className="hidden md:inline-block h-8 w-px bg-line" aria-hidden="true" />
            <span className="hidden md:inline text-[15px] font-bold text-navy tracking-tight">Mail merge</span>
          </Link>

          <nav aria-label="Mail merge" className="justify-self-center flex items-center gap-1 p-1 rounded-xl bg-navy/[0.04] ring-1 ring-inset ring-navy/[0.06]">
            {LINKS.map(link => {
              const on = link.href === '/mail-merge' ? path === '/mail-merge' : path.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 whitespace-nowrap px-3 sm:px-3.5 h-8 text-[13px] font-semibold rounded-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange ${
                    on ? 'bg-white text-navy shadow-card' : 'text-navy/55 hover:text-navy'
                  }`}
                >
                  <Icon name={link.icon} size={15} className={on ? 'text-orange' : ''} />
                  <span className="sr-only sm:not-sr-only">{link.label}</span>
                </Link>
              )
            })}
          </nav>

          <div ref={menuRef} className="justify-self-end relative">
            <button
              type="button"
              onClick={() => setMenu(m => !m)}
              aria-expanded={menu}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-full pl-1 pr-1 sm:pr-3 py-1 hover:bg-navy/[0.04] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
            >
              <Avatar text={me ?? 'me'} size={30} />
              <span className="hidden sm:block text-left leading-tight">
                <span className="block text-[13px] font-semibold text-navy max-w-[180px] truncate">{me ? me.replace(/@.*/, '') : 'Account'}</span>
                <span className="block text-[11px] text-navy/45 max-w-[180px] truncate">{me ?? ''}</span>
              </span>
              <Icon name="chevron-right" size={14} className={`hidden sm:block text-navy/40 transition-transform ${menu ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-2 w-60 bg-white border border-line rounded-xl shadow-lift p-1.5 animate-scale-in origin-top-right">
                {me && (
                  <div className="px-3 py-2 border-b border-line mb-1">
                    <p className="text-[11px] text-navy/45">Signed in as</p>
                    <p className="text-sm font-semibold text-navy truncate">{me}</p>
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-navy/80 rounded-lg hover:bg-navy/[0.05] hover:text-navy"
                >
                  <Icon name="logout" size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col min-h-0">{children}</div>
    </div>
  )
}

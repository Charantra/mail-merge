import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
}

// Login page gets a completely clean layout — no global nav.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

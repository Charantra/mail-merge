import type { Metadata } from 'next'
import { Titillium_Web } from 'next/font/google'
import './globals.css'

const titillium = Titillium_Web({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-titillium',
})

export const metadata: Metadata = {
  title: 'Charantra mail merge',
  description: 'Personalise a spreadsheet and send each row from Outlook.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${titillium.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}

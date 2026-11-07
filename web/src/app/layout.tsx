import type { Metadata } from 'next'
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google'
import { AiStatus } from '@/components/ai-status'
import { Nav } from '@/components/nav'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const sourceSerif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'], style: ['normal', 'italic'] })

export const metadata: Metadata = {
  title: { default: 'apply-for-me', template: '%s · apply-for-me' },
  description: 'Your CV blocks, a CV for each job, and your interview answers.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}>
      <body>
        <div className="shell">
          <Nav status={<AiStatus />} />
          <main className="shell-main">{children}</main>
        </div>
      </body>
    </html>
  )
}

'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string; group: 'main' | 'profile'; icon: string }

// Same order and icons as the approved design (lucide paths).
const ITEMS: NavItem[] = [
  { href: "/compose", label: "Compose CV", group: "main", icon: "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M10 3v18\"></path><path d=\"M14 8h4\"></path><path d=\"M14 12h4\"></path>" },
  { href: "/experiences", label: "Experiences", group: "main", icon: "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\"></path><path d=\"M2 6h4\"></path><path d=\"M2 10h4\"></path><path d=\"M2 14h4\"></path><path d=\"M2 18h4\"></path><path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\"></path>" },
  { href: "/behavioral", label: "Behavioral", group: "main", icon: "<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path>" },
  { href: "/jobs", label: "Jobs", group: "main", icon: "<path d=\"M8 6h13\"></path><path d=\"M8 12h13\"></path><path d=\"M8 18h13\"></path><path d=\"M3 6h.01\"></path><path d=\"M3 12h.01\"></path><path d=\"M3 18h.01\"></path>" },
  { href: "/analyze", label: "Job analysis", group: "main", icon: "<rect width=\"20\" height=\"14\" x=\"2\" y=\"7\" rx=\"2\"></rect><path d=\"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"></path>" },
  { href: "/preferences", label: "What the AI learned", group: "main", icon: "<path d=\"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z\"></path><path d=\"M19 3v4\"></path><path d=\"M21 5h-4\"></path>" },
  { href: "/blocks", label: "Blocks", group: "main", icon: "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\"></path><path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\"></path><path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\"></path>" },
  { href: "/profile#education", label: "Education", group: "profile", icon: "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"></path><path d=\"M22 10v6\"></path><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"></path>" },
  { href: "/profile#skills", label: "Technical Skills", group: "profile", icon: "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\"></path>" },
  { href: "/profile#achievements", label: "Leadership & Achievements", group: "profile", icon: "<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\"></path><circle cx=\"12\" cy=\"8\" r=\"6\"></circle>" }
]

function Icon({ paths }: { paths: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths }} />
  )
}

/** `status` is the AI status line, rendered on the server (components/ai-status.tsx). */
export function Nav({ status }: { status: ReactNode }) {
  const pathname = usePathname()
  const isCurrent = (href: string) => {
    const path = href.split('#')[0]
    return pathname === path || (path === '/behavioral' && pathname.startsWith('/behavioral'))
  }
  const link = (item: NavItem) => {
    const current = item.group === 'main' && isCurrent(item.href)
    return (
      <Link key={item.href} href={item.href} className="nav-link" aria-current={current ? 'page' : undefined}>
        <Icon paths={item.icon} />
        {item.label}
      </Link>
    )
  }
  return (
    <nav aria-label="Main" className="nav">
      <div className="nav-brand">
        <span aria-hidden="true" className="nav-logo">af</span>
        <span>apply-for-me</span>
      </div>
      <div className="nav-list">
        {ITEMS.filter((i) => i.group === 'main').map(link)}
        <div className="nav-group">PROFILE</div>
        {ITEMS.filter((i) => i.group === 'profile').map(link)}
      </div>
      {status}
    </nav>
  )
}

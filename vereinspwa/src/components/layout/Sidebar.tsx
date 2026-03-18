'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart2,
  Bell,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Kalender', href: '/calendar', icon: Calendar },
  { label: 'Spieler', href: '/players', icon: Users },
  { label: 'Termine', href: '/events', icon: ClipboardList },
  { label: 'Statistiken', href: '/stats', icon: BarChart2 },
  { label: 'Nachrichten', href: '/messages', icon: Bell },
  { label: 'Einstellungen', href: '/settings', icon: Settings },
]

interface SidebarProps {
  clubName?: string
}

export function Sidebar({ clubName = 'Vereinsname' }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="flex flex-col h-full w-[240px] shrink-0"
      style={{ backgroundColor: '#1a1a2e' }}
    >
      {/* Logo / Club Name */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#e94560' }}
          >
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span
            className="text-white font-semibold text-sm truncate"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {clubName}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
              style={
                isActive
                  ? { backgroundColor: '#e94560', borderRadius: '6px' }
                  : { borderRadius: '6px' }
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-white/30 text-xs text-center">Sprint 1</p>
      </div>
    </aside>
  )
}

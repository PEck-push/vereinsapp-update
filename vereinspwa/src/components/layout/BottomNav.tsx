'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, LayoutDashboard, MoreHorizontal, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const BOTTOM_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Kalender', href: '/calendar', icon: CalendarDays },
  { label: 'Spieler', href: '/players', icon: Users },
  { label: 'Stats', href: '/stats/training', icon: BarChart2 },
  { label: 'Mehr', href: '/settings', icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t"
      style={{ borderColor: '#e9ecef', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {BOTTOM_NAV.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors',
                isActive ? 'text-[#e94560]' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.75} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

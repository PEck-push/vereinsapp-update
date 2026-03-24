'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, LayoutDashboard, MoreHorizontal, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminProfile, type AdminRole } from '@/lib/hooks/useAdminProfile'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles?: AdminRole[]
}

const BOTTOM_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Kalender', href: '/calendar', icon: CalendarDays },
  { label: 'Spieler', href: '/players', icon: Users },
  { label: 'Stats', href: '/stats/training', icon: BarChart2 },
  {
    label: 'Einstellungen',
    href: '/settings',
    icon: Settings,
    roles: ['admin', 'secretary'],
  },
]

/**
 * Fallback item for roles that don't see Settings —
 * show "Mehr" linking to stats as a 5th tab alternative.
 */
const MORE_ITEM: NavItem = {
  label: 'Termine',
  href: '/events',
  icon: MoreHorizontal,
}

export function BottomNav() {
  const pathname = usePathname()
  const { profile } = useAdminProfile()
  const role = profile?.role ?? 'admin'

  // Build visible items
  let items = BOTTOM_NAV.filter(item => {
    if (!item.roles) return true
    return item.roles.includes(role)
  })

  // If Settings was filtered out, add the fallback item
  if (items.length < 5) {
    items = [...items, MORE_ITEM]
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t"
      style={{ borderColor: '#e9ecef', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {items.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors',
                isActive
                  ? ''
                  : 'text-gray-400 hover:text-gray-600'
              )}
              style={isActive ? { color: 'var(--club-secondary, #e94560)' } : {}}
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
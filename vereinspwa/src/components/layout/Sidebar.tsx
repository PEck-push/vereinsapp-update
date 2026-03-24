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
import { useAdminProfile, type AdminRole } from '@/lib/hooks/useAdminProfile'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  /** Which roles can see this item. If empty/undefined → visible to all admin roles */
  roles?: AdminRole[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Kalender', href: '/calendar', icon: Calendar },
  { label: 'Spieler', href: '/players', icon: Users },
  { label: 'Termine', href: '/events', icon: ClipboardList },
  { label: 'Statistiken', href: '/stats', icon: BarChart2 },
  { label: 'Nachrichten', href: '/messages', icon: Bell },
  {
    label: 'Einstellungen',
    href: '/settings',
    icon: Settings,
    roles: ['admin', 'secretary'],
  },
]

interface SidebarProps {
  clubName?: string
  logoUrl?: string | null
}

export function Sidebar({ clubName = 'Vereinsname', logoUrl }: SidebarProps) {
  const pathname = usePathname()
  const { profile } = useAdminProfile()
  const role = profile?.role ?? 'admin'

  // Filter nav items by role
  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true
    return item.roles.includes(role)
  })

  return (
    <aside
      className="flex flex-col h-full w-[240px] shrink-0"
      style={{ backgroundColor: 'var(--club-primary, #1a1a2e)' }}
    >
      {/* Logo / Club Name */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: 'var(--club-secondary, #e94560)' }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={clubName}
                className="w-full h-full object-contain"
              />
            ) : (
              <span
                className="font-bold text-sm"
                style={{ color: 'var(--club-secondary-text, #ffffff)' }}
              >
                {clubName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span
              className="font-semibold text-sm truncate block"
              style={{
                fontFamily: 'Outfit, sans-serif',
                color: 'var(--club-primary-text, #ffffff)',
              }}
            >
              {clubName}
            </span>
            {role !== 'admin' && (
              <span
                className="text-[10px] block truncate"
                style={{ color: 'color-mix(in srgb, var(--club-primary-text, #ffffff) 50%, transparent)' }}
              >
                {role === 'trainer' ? 'Trainer' :
                 role === 'funktionaer' ? 'Funktionär' :
                 role === 'secretary' ? 'Sekretär' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive ? '' : 'hover:bg-white/5'
              )}
              style={
                isActive
                  ? {
                      backgroundColor: 'var(--club-secondary, #e94560)',
                      color: 'var(--club-secondary-text, #ffffff)',
                      borderRadius: '6px',
                    }
                  : {
                      color: 'color-mix(in srgb, var(--club-primary-text, #ffffff) 65%, transparent)',
                      borderRadius: '6px',
                    }
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
        <p
          className="text-xs text-center"
          style={{ color: 'color-mix(in srgb, var(--club-primary-text, #ffffff) 30%, transparent)' }}
        >
          Vereinsmanager
        </p>
      </div>
    </aside>
  )
}
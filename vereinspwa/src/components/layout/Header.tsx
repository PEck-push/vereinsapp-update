'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, LogOut, Menu, User } from 'lucide-react'

interface HeaderProps {
  clubName?: string
  logoUrl?: string | null
  onMenuToggle?: () => void
}

export function Header({ clubName = 'Vereinsname', logoUrl, onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) return
    const unsub = onAuthStateChanged(auth, (user) => {
      setUserEmail(user?.email ?? null)
      setDisplayName(user?.displayName ?? null)
    })
    return unsub
  }, [])

  async function handleLogout() {
    try { await signOut(auth); await fetch('/api/auth/session', { method: 'DELETE' }) }
    catch (error) { console.error('[Header] Logout error:', error) }
    finally { router.push('/login'); router.refresh() }
  }

  // Initials: from displayName if available, otherwise from email
  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : userEmail
    ? userEmail.substring(0, 2).toUpperCase()
    : 'AD'

  // Display label: name if available, otherwise email
  const displayLabel = displayName || userEmail || 'Admin'

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b bg-white shrink-0" style={{ borderColor: '#e9ecef' }}>
      {/* Mobile: hamburger + logo */}
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={onMenuToggle} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Menü öffnen">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded overflow-hidden flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--club-primary, #1a1a2e)' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={clubName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs font-bold" style={{ color: 'var(--club-primary-text, #ffffff)' }}>
                {clubName.charAt(0)}
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700 truncate max-w-[140px]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {clubName}
          </span>
        </div>
      </div>

      {/* Desktop: club name */}
      <span className="hidden md:block text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>{clubName}</span>

      <div className="flex-1 md:hidden" />

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 h-9 px-2 hover:bg-gray-100" style={{ borderRadius: '6px' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: 'var(--club-primary, #1a1a2e)', color: 'var(--club-primary-text, #ffffff)' }}>
              {initials}
            </div>
            <span className="hidden sm:block text-sm text-gray-700 max-w-[160px] truncate">{displayLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem disabled>
            <User className="w-4 h-4 mr-2" />
            <span className="text-xs text-gray-500 truncate">{displayLabel}</span>
          </DropdownMenuItem>
          {userEmail && displayName && (
            <DropdownMenuItem disabled>
              <span className="text-xs text-gray-400 truncate pl-6">{userEmail}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
            <LogOut className="w-4 h-4 mr-2" />Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
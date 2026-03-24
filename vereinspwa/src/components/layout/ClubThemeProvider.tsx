'use client'

import { createContext, useContext, useEffect } from 'react'
import { useClubSettings, type ClubSettings } from '@/lib/hooks/useClubSettings'

interface ClubThemeContextValue {
  settings: ClubSettings
  loading: boolean
}

const ClubThemeContext = createContext<ClubThemeContextValue>({
  settings: {
    name: 'Mein Verein',
    logoUrl: null,
    primaryColor: '#1a1a2e',
    secondaryColor: '#e94560',
  },
  loading: true,
})

export function useClubTheme() {
  return useContext(ClubThemeContext)
}

/**
 * Helper: determine if a hex color is "light" (needs dark text)
 * or "dark" (needs white text).
 */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 155
}

export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useClubSettings()

  // Apply CSS custom properties whenever settings change
  useEffect(() => {
    const root = document.documentElement

    root.style.setProperty('--club-primary', settings.primaryColor)
    root.style.setProperty('--club-secondary', settings.secondaryColor)

    // Auto-detect text color for primary background
    const primaryTextColor = isLightColor(settings.primaryColor) ? '#1a1a2e' : '#ffffff'
    const secondaryTextColor = isLightColor(settings.secondaryColor) ? '#1a1a2e' : '#ffffff'

    root.style.setProperty('--club-primary-text', primaryTextColor)
    root.style.setProperty('--club-secondary-text', secondaryTextColor)

    // Muted version of primary for hover states
    root.style.setProperty('--club-primary-muted', `${settings.primaryColor}15`)

  }, [settings.primaryColor, settings.secondaryColor])

  return (
    <ClubThemeContext.Provider value={{ settings, loading }}>
      {children}
    </ClubThemeContext.Provider>
  )
}
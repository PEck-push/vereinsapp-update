'use client'

import { createContext, useContext, useEffect } from 'react'
import { useClubSettings, type ClubSettings } from '@/lib/hooks/useClubSettings'

interface ClubThemeContextValue {
  settings: ClubSettings
  seedMode: boolean
  loading: boolean
}

const ClubThemeContext = createContext<ClubThemeContextValue>({
  settings: {
    name: 'Mein Verein',
    logoUrl: null,
    primaryColor: '#1a1a2e',
    secondaryColor: '#e94560',
  },
  seedMode: false,
  loading: true,
})

export function useClubTheme() {
  return useContext(ClubThemeContext)
}

function getLuminance(hex: string): number {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16) / 255
  const g = parseInt(c.substring(2, 4), 16) / 255
  const b = parseInt(c.substring(4, 6), 16) / 255
  const toLinear = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1)
  const l2 = getLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.4
}

function darkenColor(hex: string, factor: number): string {
  const c = hex.replace('#', '')
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - factor))
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - factor))
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, seedMode, loading } = useClubSettings()

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--club-primary', settings.primaryColor)

    const contrastOnWhite = getContrastRatio(settings.secondaryColor, '#ffffff')
    let effectiveSecondary = settings.secondaryColor
    if (contrastOnWhite < 3) {
      const darkened = darkenColor(settings.secondaryColor, 0.4)
      effectiveSecondary = getContrastRatio(darkened, '#ffffff') >= 3 ? darkened : settings.primaryColor
    }
    root.style.setProperty('--club-secondary', effectiveSecondary)

    const primaryTextColor = isLightColor(settings.primaryColor) ? '#1a1a2e' : '#ffffff'
    const secondaryTextColor = isLightColor(effectiveSecondary) ? '#1a1a2e' : '#ffffff'
    root.style.setProperty('--club-primary-text', primaryTextColor)
    root.style.setProperty('--club-secondary-text', secondaryTextColor)
    root.style.setProperty('--club-primary-muted', `${settings.primaryColor}15`)
  }, [settings.primaryColor, settings.secondaryColor])

  return (
    <ClubThemeContext.Provider value={{ settings, seedMode, loading }}>
      {children}
    </ClubThemeContext.Provider>
  )
}
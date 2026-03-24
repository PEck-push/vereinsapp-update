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
 * Calculate relative luminance of a hex color (0 = black, 1 = white)
 */
function getLuminance(hex: string): number {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16) / 255
  const g = parseInt(c.substring(2, 4), 16) / 255
  const b = parseInt(c.substring(4, 6), 16) / 255

  const toLinear = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * WCAG contrast ratio between two colors (1:1 = identical, 21:1 = black/white)
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1)
  const l2 = getLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Determine if a hex color is "light" (needs dark text) or "dark" (needs white text)
 */
function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.4
}

/**
 * Darken a hex color by a factor (0 = unchanged, 1 = black)
 */
function darkenColor(hex: string, factor: number): string {
  const c = hex.replace('#', '')
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - factor))
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - factor))
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useClubSettings()

  useEffect(() => {
    const root = document.documentElement

    root.style.setProperty('--club-primary', settings.primaryColor)

    // Contrast check: if secondary color has insufficient contrast against white
    // (e.g. user picked white or very light color), fall back to primary or darken it
    const contrastOnWhite = getContrastRatio(settings.secondaryColor, '#ffffff')
    let effectiveSecondary = settings.secondaryColor

    if (contrastOnWhite < 3) {
      // Too light for white backgrounds — try darkening it
      const darkened = darkenColor(settings.secondaryColor, 0.4)
      const darkenedContrast = getContrastRatio(darkened, '#ffffff')

      if (darkenedContrast >= 3) {
        effectiveSecondary = darkened
      } else {
        // Still not enough — fall back to primary color
        effectiveSecondary = settings.primaryColor
      }
    }

    root.style.setProperty('--club-secondary', effectiveSecondary)

    // Text colors for overlays
    const primaryTextColor = isLightColor(settings.primaryColor) ? '#1a1a2e' : '#ffffff'
    const secondaryTextColor = isLightColor(effectiveSecondary) ? '#1a1a2e' : '#ffffff'

    root.style.setProperty('--club-primary-text', primaryTextColor)
    root.style.setProperty('--club-secondary-text', secondaryTextColor)
    root.style.setProperty('--club-primary-muted', `${settings.primaryColor}15`)

  }, [settings.primaryColor, settings.secondaryColor])

  return (
    <ClubThemeContext.Provider value={{ settings, loading }}>
      {children}
    </ClubThemeContext.Provider>
  )
}
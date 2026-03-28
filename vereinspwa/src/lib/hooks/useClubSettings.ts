'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

export interface ClubSettings {
  name: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
}

const DEFAULTS: ClubSettings = {
  name: 'Mein Verein',
  logoUrl: null,
  primaryColor: '#1a1a2e',
  secondaryColor: '#e94560',
}

/**
 * Loads club settings (name, logo, colors) from Firestore.
 * Listens in realtime — changes in Settings are reflected instantly.
 *
 * Also exposes `seedMode` flag: true if the club document has _seedMode: true
 * (set by the seed script to indicate test data is present).
 */
export function useClubSettings() {
  const [settings, setSettings] = useState<ClubSettings>(DEFAULTS)
  const [seedMode, setSeedMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!db) { setLoading(false); return }

    const unsub = onSnapshot(
      doc(db, 'clubs', CLUB_ID),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setSettings({
            name: data.name || DEFAULTS.name,
            logoUrl: data.logoUrl || null,
            primaryColor: data.primaryColor || DEFAULTS.primaryColor,
            secondaryColor: data.secondaryColor || DEFAULTS.secondaryColor,
          })
          setSeedMode(data._seedMode === true)
        }
        setLoading(false)
      },
      (err) => {
        console.error('[useClubSettings]', err)
        setLoading(false)
      }
    )

    return unsub
  }, [])

  return { settings, seedMode, loading }
}
'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

interface ClubAvatarProps {
  size?: number
  className?: string
}

let cachedLogoUrl: string | null | undefined = undefined
let cachedPrimaryColor: string | undefined = undefined
let cachedClubName: string | undefined = undefined

export function ClubAvatar({ size = 40, className = '' }: ClubAvatarProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedLogoUrl ?? null)
  const [primaryColor, setPrimaryColor] = useState(cachedPrimaryColor ?? '#1a1a2e')
  const [clubName, setClubName] = useState(cachedClubName ?? 'V')

  useEffect(() => {
    if (cachedLogoUrl !== undefined) return
    if (!db) return
    getDoc(doc(db, 'clubs', CLUB_ID)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        cachedLogoUrl = data.logoUrl || null
        cachedPrimaryColor = data.primaryColor || '#1a1a2e'
        cachedClubName = data.name || 'V'
        setLogoUrl(cachedLogoUrl ?? null)
        setPrimaryColor(cachedPrimaryColor ?? '#1a1a2e')
        setClubName(cachedClubName ?? 'V')
      }
    })
  }, [])

  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: primaryColor, fontSize: size * 0.4 }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
      ) : (
        clubName.charAt(0).toUpperCase()
      )}
    </div>
  )
}

interface PlayerAvatarProps {
  firstName: string
  lastName: string
  size?: number
  className?: string
}

export function PlayerAvatar({ firstName, lastName, size = 28, className = '' }: PlayerAvatarProps) {
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: 'var(--club-primary, #1a1a2e)', fontSize: size * 0.35 }}
    >
      {firstName[0]}{lastName[0]}
    </div>
  )
}

export function invalidateClubAvatarCache() {
  cachedLogoUrl = undefined
  cachedPrimaryColor = undefined
  cachedClubName = undefined
}

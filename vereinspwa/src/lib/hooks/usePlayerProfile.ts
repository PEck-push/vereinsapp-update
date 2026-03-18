import { useEffect, useState } from 'react'
import type { Player } from '@/lib/types'

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; player: Player }

export function usePlayerProfile() {
  const [state, setState] = useState<ProfileState>({ status: 'loading' })

  async function load() {
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/player/profile')
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden.')
      const data = await res.json()
      setState({ status: 'ok', player: data as Player })
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message })
    }
  }

  useEffect(() => { load() }, [])

  async function updateProfile(updates: Partial<Pick<Player, 'phone' | 'notificationPrefs'>>) {
    const res = await fetch('/api/player/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Speichern fehlgeschlagen.')
    await load()
  }

  return { state, updateProfile, reload: load }
}

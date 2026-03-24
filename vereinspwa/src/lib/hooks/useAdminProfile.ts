'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

interface AdminProfile {
  uid: string
  role: 'admin' | 'trainer' | 'secretary'
  teamIds: string[]
}

type AdminProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: AdminProfile }

/**
 * Reads the current user's admin profile from Firestore.
 *
 * - role 'admin' → sees all teams (teamIds ignored, returns empty array as signal)
 * - role 'trainer' → sees only their assigned teamIds
 * - role 'secretary' → sees all teams
 *
 * Use `isAllTeams` to check if filtering should be skipped.
 */
export function useAdminProfile() {
  const [state, setState] = useState<AdminProfileState>({ status: 'loading' })

  useEffect(() => {
    if (!auth) {
      setState({ status: 'error', message: 'Auth nicht initialisiert' })
      return
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: 'error', message: 'Nicht eingeloggt' })
        return
      }

      try {
        const adminDoc = await getDoc(
          doc(db, 'clubs', CLUB_ID, 'adminUsers', user.uid)
        )

        if (!adminDoc.exists()) {
          // Might be a player, not an admin — or doc structure differs
          // Fallback: try reading custom claims
          const tokenResult = await user.getIdTokenResult()
          const role = (tokenResult.claims.role as string) ?? 'admin'
          setState({
            status: 'ok',
            profile: {
              uid: user.uid,
              role: role as AdminProfile['role'],
              teamIds: [],
            },
          })
          return
        }

        const data = adminDoc.data()
        setState({
          status: 'ok',
          profile: {
            uid: user.uid,
            role: data.role ?? 'admin',
            teamIds: data.teamIds ?? [],
          },
        })
      } catch (err) {
        console.error('[useAdminProfile]', err)
        setState({ status: 'error', message: 'Profil konnte nicht geladen werden' })
      }
    })

    return unsub
  }, [])

  const profile = state.status === 'ok' ? state.profile : null
  const isAllTeams = profile?.role === 'admin' || profile?.role === 'secretary' || (profile?.teamIds.length === 0)

  return { state, profile, isAllTeams }
}
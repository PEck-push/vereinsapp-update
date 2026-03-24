'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

export type AdminRole = 'admin' | 'funktionaer' | 'trainer' | 'secretary'

interface AdminProfile {
  uid: string
  role: AdminRole
  teamIds: string[]
  displayName?: string
}

type AdminProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: AdminProfile }

/**
 * Reads the current user's admin profile from Firestore.
 *
 * Role permissions:
 * - admin → sees all teams, full access
 * - secretary → sees all teams, full access
 * - funktionaer → sees all teams, can create events, no settings/user management
 * - trainer → sees only assigned teamIds
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
          const tokenResult = await user.getIdTokenResult()
          const role = (tokenResult.claims.role as string) ?? 'admin'
          setState({
            status: 'ok',
            profile: {
              uid: user.uid,
              role: role as AdminRole,
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
            role: (data.role ?? 'admin') as AdminRole,
            teamIds: data.teamIds ?? [],
            displayName: data.displayName,
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

  // These roles see all teams (not team-scoped)
  const isAllTeams =
    profile?.role === 'admin' ||
    profile?.role === 'secretary' ||
    profile?.role === 'funktionaer' ||
    (profile?.teamIds.length === 0)

  // Can manage settings and users
  const canManageSettings = profile?.role === 'admin' || profile?.role === 'secretary'

  // Can create/edit events
  const canManageEvents =
    profile?.role === 'admin' ||
    profile?.role === 'secretary' ||
    profile?.role === 'funktionaer' ||
    profile?.role === 'trainer'

  return { state, profile, isAllTeams, canManageSettings, canManageEvents }
}
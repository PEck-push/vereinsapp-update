import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { Player } from '@/lib/types'

function playersRef() {
  return collection(db, 'clubs', CLUB_ID, 'players')
}

export function usePlayers(teamId?: string) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Firestore `array-contains` filter when teamId is given,
    // otherwise fetch all players for this club.
    const q = teamId
      ? query(
          playersRef(),
          where('teamIds', 'array-contains', teamId),
          orderBy('lastName')
        )
      : query(playersRef(), orderBy('lastName'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlayers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Player)
        )
        setLoading(false)
      },
      (err) => {
        console.error('[usePlayers]', err)
        setError('Spieler konnten nicht geladen werden.')
        setLoading(false)
      }
    )
    return unsub
  }, [teamId])

  async function addPlayer(
    data: Omit<
      Player,
      | 'id'
      | 'clubId'
      | 'createdAt'
      | 'updatedAt'
      | 'inviteToken'
      | 'inviteTokenExpiry'
      | 'inviteTokenUsed'
      | 'accountStatus'
      | 'uid'
      | 'fcmTokens'
    >
  ) {
    await addDoc(playersRef(), {
      ...data,
      clubId: CLUB_ID,
      inviteTokenUsed: false,
      accountStatus: 'invited',
      fcmTokens: [],
      notificationPrefs: data.notificationPrefs ?? { push: true, email: true },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function updatePlayer(
    id: string,
    data: Partial<Omit<Player, 'id' | 'clubId' | 'createdAt'>>
  ) {
    await updateDoc(doc(playersRef(), id), {
      ...data,
      updatedAt: serverTimestamp(),
    })
  }

  /** Soft-delete: setzt status auf 'inactive', kein echtes Löschen */
  async function archivePlayer(id: string) {
    await updateDoc(doc(playersRef(), id), {
      status: 'inactive',
      accountStatus: 'deactivated',
      updatedAt: serverTimestamp(),
    })
  }

  return { players, loading, error, addPlayer, updatePlayer, archivePlayer }
}

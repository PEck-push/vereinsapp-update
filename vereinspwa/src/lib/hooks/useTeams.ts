import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { Team } from '@/lib/types'

function teamsRef() {
  return collection(db, 'clubs', CLUB_ID, 'teams')
}

function playersRef() {
  return collection(db, 'clubs', CLUB_ID, 'players')
}

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(teamsRef(), orderBy('name'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTeams(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Team)
        )
        setLoading(false)
      },
      (err) => {
        console.error('[useTeams]', err)
        setError('Teams konnten nicht geladen werden.')
        setLoading(false)
      }
    )
    return unsub
  }, [])

  async function addTeam(data: Omit<Team, 'id' | 'clubId' | 'createdAt'>) {
    await addDoc(teamsRef(), {
      ...data,
      clubId: CLUB_ID,
      createdAt: serverTimestamp(),
    })
  }

  async function updateTeam(id: string, data: Partial<Omit<Team, 'id' | 'clubId' | 'createdAt'>>) {
    await updateDoc(doc(teamsRef(), id), data)
  }

  async function deleteTeam(id: string): Promise<void> {
    // Guard: check if any active players are assigned to this team
    const q = query(playersRef(), where('teamIds', 'array-contains', id))
    const snap = await getDocs(q)
    const activeCount = snap.docs.filter(
      (d) => d.data().status !== 'inactive'
    ).length

    if (activeCount > 0) {
      throw new Error(
        `Dieses Team hat noch ${activeCount} Spieler. Bitte zuerst alle Spieler umweisen.`
      )
    }

    await deleteDoc(doc(teamsRef(), id))
  }

  return { teams, loading, error, addTeam, updateTeam, deleteTeam }
}

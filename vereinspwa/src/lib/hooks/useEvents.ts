import { useEffect, useState } from 'react'
import {
  addDoc, collection, doc, getDoc, increment, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { ClubEvent, EventResponse } from '@/lib/types'

function eventsRef() { return collection(db, 'clubs', CLUB_ID, 'events') }
function responsesRef(eventId: string) { return collection(db, 'clubs', CLUB_ID, 'events', eventId, 'responses') }

// Standalone export – used by EventResponseDialog and other components
// that cannot call the hook (e.g. outside React component tree)
export async function submitResponse(
  eventId: string,
  playerId: string,
  response: Omit<EventResponse, 'respondedAt' | 'source'>
): Promise<void> {
  const responseDoc = doc(responsesRef(eventId), playerId)
  const existing = await getDoc(responseDoc)
  const previousStatus = existing.exists() ? (existing.data().status as string) : null

  await setDoc(responseDoc, { ...response, respondedAt: serverTimestamp(), source: 'pwa' }, { merge: true })

  const eventDoc = doc(eventsRef(), eventId)
  const newStatus = response.status
  if (!previousStatus) {
    await updateDoc(eventDoc, {
      [`responseCount.${newStatus}`]: increment(1),
      'responseCount.total': increment(1),
      updatedAt: serverTimestamp(),
    })
  } else if (previousStatus !== newStatus) {
    await updateDoc(eventDoc, {
      [`responseCount.${previousStatus}`]: increment(-1),
      [`responseCount.${newStatus}`]: increment(1),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useEvents(teamId?: string) {
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = teamId
      ? query(eventsRef(), where('teamIds', 'array-contains', teamId), orderBy('startDate'))
      : query(eventsRef(), orderBy('startDate'))
    const unsub = onSnapshot(q,
      (snap) => { setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClubEvent)); setLoading(false) },
      (err) => { console.error('[useEvents]', err); setError('Termine konnten nicht geladen werden.'); setLoading(false) }
    )
    return unsub
  }, [teamId])

  async function addEvent(data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(eventsRef(), {
      ...data, clubId: CLUB_ID,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    return docRef.id
  }

  async function updateEvent(id: string, data: Partial<Omit<ClubEvent, 'id' | 'clubId' | 'createdAt'>>) {
    await updateDoc(doc(eventsRef(), id), { ...data, updatedAt: serverTimestamp() })
  }

  async function deleteEvent(id: string) {
    const { deleteDoc } = await import('firebase/firestore')
    await deleteDoc(doc(eventsRef(), id))
  }

  async function adminSetResponse(eventId: string, playerId: string, status: 'accepted' | 'declined') {
    return submitResponse(eventId, playerId, { playerId, status })
  }

  return { events, loading, error, addEvent, updateEvent, deleteEvent, submitResponse, adminSetResponse }
}

export function useEventResponses(eventId: string) {
  const [responses, setResponses] = useState<(EventResponse & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!eventId) return
    const unsub = onSnapshot(responsesRef(eventId), (snap) => {
      setResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventResponse & { id: string }))
      setLoading(false)
    })
    return unsub
  }, [eventId])
  return { responses, loading }
}

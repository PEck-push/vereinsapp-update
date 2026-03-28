import { useEffect, useState } from 'react'
import {
  addDoc, collection, doc, getDoc, increment, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { ClubEvent, EventResponse, RecurrenceFrequency } from '@/lib/types'

function eventsRef() { return collection(db, 'clubs', CLUB_ID, 'events') }
function responsesRef(eventId: string) { return collection(db, 'clubs', CLUB_ID, 'events', eventId, 'responses') }

// ─── Recurrence expansion ─────────────────────────────────────────────────────

interface RecurrenceInput {
  frequency: RecurrenceFrequency
  daysOfWeek: number[]
  until: Date
}

/**
 * Generate all dates for a recurring event series.
 * Returns dates (without the original startDate — that's the first event).
 */
function expandRecurrenceDates(
  startDate: Date,
  rule: RecurrenceInput
): Date[] {
  const dates: Date[] = []
  const intervalWeeks = rule.frequency === 'biweekly' ? 2 : 1
  const untilMs = rule.until.getTime()

  // Start from the week of the start date
  const baseMonday = getMonday(startDate)

  // Cap at 200 events to prevent runaway generation
  const MAX_EVENTS = 200
  let weekOffset = 0

  while (dates.length < MAX_EVENTS) {
    const weekStart = new Date(baseMonday)
    weekStart.setDate(weekStart.getDate() + weekOffset * 7)

    if (weekStart.getTime() > untilMs + 7 * 24 * 60 * 60 * 1000) break

    for (const day of rule.daysOfWeek) {
      const date = new Date(weekStart)
      // getDay: 0=Sun, 1=Mon, ... but our weekStart is Monday
      // Convert: Mon=1 → offset 0, Tue=2 → offset 1, ..., Sun=0 → offset 6
      const dayOffset = day === 0 ? 6 : day - 1
      date.setDate(date.getDate() + dayOffset)

      // Skip dates before or equal to the original start date
      if (date.getTime() <= startDate.getTime()) continue
      // Skip dates after the end date
      if (date.getTime() > untilMs) continue

      // Copy time from the original start date
      date.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0)

      dates.push(new Date(date))
    }

    weekOffset += intervalWeeks
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Compute endDate for a recurring instance, preserving the duration
 * of the original event.
 */
function computeEndDate(instanceStart: Date, originalStart: Date, originalEnd?: Date): Date | null {
  if (!originalEnd) return null
  const durationMs = originalEnd.getTime() - originalStart.getTime()
  return new Date(instanceStart.getTime() + durationMs)
}

// ─── Standalone export ────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

  /**
   * Add a single event or a recurring series.
   * When recurrence is provided, creates the first event as the "template"
   * and generates all instances as individual Firestore documents.
   *
   * Uses writeBatch to create all events atomically (max 500 per batch).
   */
  async function addEvent(
    data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>,
    recurrence?: RecurrenceInput
  ) {
    const baseDoc = {
      ...data,
      clubId: CLUB_ID,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (!recurrence) {
      // Single event — simple addDoc
      const docRef = await addDoc(eventsRef(), baseDoc)
      return docRef.id
    }

    // ── Recurring series ──

    const startDate = data.startDate instanceof Date ? data.startDate : new Date(data.startDate as unknown as string)
    const endDate = data.endDate instanceof Date ? data.endDate : data.endDate ? new Date(data.endDate as unknown as string) : undefined

    // Generate all recurrence dates
    const additionalDates = expandRecurrenceDates(startDate, recurrence)

    if (additionalDates.length === 0) {
      // No additional dates — just create the single event
      const docRef = await addDoc(eventsRef(), baseDoc)
      return docRef.id
    }

    // Create the first event (template) and get its ID for grouping
    const templateDoc = await addDoc(eventsRef(), {
      ...baseDoc,
      recurrenceRule: {
        frequency: recurrence.frequency,
        daysOfWeek: recurrence.daysOfWeek,
        until: recurrence.until,
      },
    })

    const groupId = templateDoc.id

    // Update the template with its own groupId
    await updateDoc(templateDoc, { recurrenceGroupId: groupId })

    // Create all instances in batches of 500 (Firestore limit)
    const BATCH_SIZE = 490 // Leave room for safety
    for (let i = 0; i < additionalDates.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = additionalDates.slice(i, i + BATCH_SIZE)

      for (const instanceDate of chunk) {
        const instanceEnd = computeEndDate(instanceDate, startDate, endDate)
        const instanceRef = doc(eventsRef())

        batch.set(instanceRef, {
          ...baseDoc,
          startDate: instanceDate,
          ...(instanceEnd && { endDate: instanceEnd }),
          recurrenceGroupId: groupId,
          // Individual instances don't store the rule — only the template does
        })
      }

      await batch.commit()
    }

    return groupId
  }

  async function updateEvent(id: string, data: Partial<Omit<ClubEvent, 'id' | 'clubId' | 'createdAt'>>) {
    await updateDoc(doc(eventsRef(), id), { ...data, updatedAt: serverTimestamp() })
  }

  async function deleteEvent(id: string) {
    const { deleteDoc } = await import('firebase/firestore')
    await deleteDoc(doc(eventsRef(), id))
  }

  /**
   * Delete all events in a recurring series.
   * Optionally only future events (from a given date).
   */
  async function deleteRecurringSeries(groupId: string, fromDate?: Date) {
    const { deleteDoc: delDoc, getDocs: getSnap } = await import('firebase/firestore')

    let q = query(eventsRef(), where('recurrenceGroupId', '==', groupId))

    const snap = await getSnap(q)
    const batch = writeBatch(db)

    for (const docSnap of snap.docs) {
      if (fromDate) {
        const eventDate = docSnap.data().startDate?.toDate?.() ?? new Date(docSnap.data().startDate)
        if (eventDate < fromDate) continue
      }
      batch.delete(docSnap.ref)
    }

    await batch.commit()
  }

  async function adminSetResponse(eventId: string, playerId: string, status: 'accepted' | 'declined') {
    return submitResponse(eventId, playerId, { playerId, status })
  }

  return {
    events, loading, error,
    addEvent, updateEvent, deleteEvent,
    deleteRecurringSeries,
    submitResponse, adminSetResponse,
  }
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
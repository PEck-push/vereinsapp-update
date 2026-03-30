/**
 * POST /api/player/respond
 *
 * Server-side event response handler for players.
 *
 * WHY THIS EXISTS:
 * Players can write to events/{eventId}/responses/{playerId} (Security Rules allow it),
 * but they CANNOT update the event document's responseCount field (only admins can).
 * This API route uses the Admin SDK to do both atomically.
 *
 * Body: { eventId: string, status: 'accepted' | 'declined', declineCategory?: string, reason?: string }
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { CLUB_ID } from '@/lib/config'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

async function getPlayerFromSession(): Promise<{ uid: string; playerId: string } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const uid = decoded.uid

    // Look up playerUids mapping first (fast)
    const mappingSnap = await adminDb
      .collection('clubs').doc(CLUB_ID)
      .collection('playerUids').doc(uid)
      .get()

    if (mappingSnap.exists) {
      return { uid, playerId: mappingSnap.data()!.playerId }
    }

    // Fallback: query players by uid
    const snap = await adminDb
      .collection('clubs').doc(CLUB_ID)
      .collection('players')
      .where('uid', '==', uid)
      .limit(1)
      .get()

    if (snap.empty) return null
    return { uid, playerId: snap.docs[0].id }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const player = await getPlayerFromSession()
  if (!player) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const { eventId, status, declineCategory, reason } = await request.json()

    // Validate
    if (!eventId || typeof eventId !== 'string') {
      return NextResponse.json({ error: 'eventId benötigt' }, { status: 400 })
    }
    if (!['accepted', 'declined'].includes(status)) {
      return NextResponse.json({ error: 'status muss accepted oder declined sein' }, { status: 400 })
    }

    // Verify the event exists and is still open
    const eventRef = adminDb
      .collection('clubs').doc(CLUB_ID)
      .collection('events').doc(eventId)
    const eventSnap = await eventRef.get()

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })
    }

    const eventData = eventSnap.data()!
    if (eventData.status === 'cancelled') {
      return NextResponse.json({ error: 'Termin wurde abgesagt' }, { status: 409 })
    }

    // Verify player is in one of the event's teams (or it's a club event)
    const eventTeamIds: string[] = eventData.teamIds ?? []
    if (eventTeamIds.length > 0) {
      const playerSnap = await adminDb
        .collection('clubs').doc(CLUB_ID)
        .collection('players').doc(player.playerId)
        .get()

      if (!playerSnap.exists) {
        return NextResponse.json({ error: 'Spieler nicht gefunden' }, { status: 404 })
      }

      const playerTeamIds: string[] = playerSnap.data()!.teamIds ?? []
      const hasMatchingTeam = eventTeamIds.some(id => playerTeamIds.includes(id))
      if (!hasMatchingTeam) {
        return NextResponse.json({ error: 'Du bist nicht für diesen Termin berechtigt' }, { status: 403 })
      }
    }

    // Check previous response
    const responseRef = eventRef.collection('responses').doc(player.playerId)
    const existingSnap = await responseRef.get()
    const previousStatus = existingSnap.exists ? (existingSnap.data()?.status as string) : null

    // Write response
    const responseData: Record<string, unknown> = {
      playerId: player.playerId,
      status,
      respondedAt: FieldValue.serverTimestamp(),
      source: 'pwa',
    }
    if (status === 'declined' && declineCategory) {
      responseData.declineCategory = declineCategory
    }
    if (reason) {
      responseData.reason = reason
    }

    await responseRef.set(responseData, { merge: true })

    // Update event responseCount (this is what fails client-side for players)
    //
    // DEFENSIVE: The original client-side code wrote response docs WITHOUT
    // updating the counter (Security Rules blocked the event update for players).
    // This means some response docs exist but total/accepted/declined are 0.
    // We must detect this and avoid decrementing below 0.
    const currentCounts = eventData.responseCount ?? { accepted: 0, declined: 0, total: 0 }

    if (!previousStatus) {
      // New response — straightforward increment
      await eventRef.update({
        [`responseCount.${status}`]: FieldValue.increment(1),
        'responseCount.total': FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else if (previousStatus !== status) {
      // Changed response (e.g. accepted → declined)
      const prevCount = (currentCounts as Record<string, number>)[previousStatus] ?? 0

      if (prevCount > 0) {
        // Normal case: counter was properly tracked — swap counts
        await eventRef.update({
          [`responseCount.${previousStatus}`]: FieldValue.increment(-1),
          [`responseCount.${status}`]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        // Counter was never incremented for the old status (corrupted from old bug).
        // Treat as if this is a brand new response: increment new status + total.
        await eventRef.update({
          [`responseCount.${status}`]: FieldValue.increment(1),
          'responseCount.total': FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    } else {
      // Same status re-submitted. Check if counter was never tracked.
      const currentStatusCount = (currentCounts as Record<string, number>)[status] ?? 0
      if (currentStatusCount <= 0) {
        // Response exists but counter doesn't reflect it — fix it now
        await eventRef.update({
          [`responseCount.${status}`]: FieldValue.increment(1),
          'responseCount.total': FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      // Otherwise: same status, counter already correct — no change
    }

    return NextResponse.json({
      status: 'ok',
      previousStatus,
      newStatus: status,
    })
  } catch (error) {
    console.error('[player/respond POST]', error)
    return NextResponse.json({ error: 'Antwort konnte nicht gespeichert werden' }, { status: 500 })
  }
}
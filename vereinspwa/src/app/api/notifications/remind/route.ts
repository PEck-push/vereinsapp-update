/**
 * POST /api/notifications/remind
 *
 * Send reminder push notifications to specific players for an event.
 * Rate-limited: max 1 reminder per player per event every 4 hours.
 *
 * Body: { eventId: string, playerIds: string[] }
 * Returns: { sent: number, skipped: number, failed: number }
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getMessaging } from 'firebase-admin/messaging'
import { getApp } from 'firebase-admin/app'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['admin', 'trainer', 'secretary', 'funktionaer'])
const COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4 hours

async function verifyAdmin(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    if (role && ADMIN_ROLES.has(role)) return decoded.uid
    const clubId = await getClubIdFromSession()
    if (!clubId) return null
    const adminDoc = await adminDb
      .collection('clubs').doc(clubId)
      .collection('adminUsers').doc(decoded.uid)
      .get()
    if (adminDoc.exists) {
      const docRole = adminDoc.data()?.role as string
      if (ADMIN_ROLES.has(docRole)) return decoded.uid
    }
    return null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const { eventId, playerIds } = await request.json()

    if (!eventId || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ error: 'eventId und playerIds benötigt' }, { status: 400 })
    }

    // Load event
    const eventRef = adminDb.collection('clubs').doc(clubId).collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event nicht gefunden' }, { status: 404 })
    }

    const eventData = eventSnap.data()!
    const eventTitle = eventData.title as string
    const startDate = eventData.startDate instanceof Timestamp
      ? eventData.startDate.toDate()
      : new Date(eventData.startDate as string)

    const dateStr = startDate.toLocaleDateString('de-AT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Check rate limits
    const remindersRef = eventRef.collection('reminders')
    const now = Date.now()
    let sent = 0
    let skipped = 0
    let failed = 0

    const messaging = getMessaging(getApp('admin'))

    for (const playerId of playerIds) {
      // Check cooldown
      const reminderDoc = await remindersRef.doc(playerId).get()
      if (reminderDoc.exists) {
        const lastSentAt = reminderDoc.data()?.lastSentAt
        const lastSentMs = lastSentAt instanceof Timestamp
          ? lastSentAt.toDate().getTime()
          : typeof lastSentAt === 'number' ? lastSentAt : 0

        if (now - lastSentMs < COOLDOWN_MS) {
          skipped++
          continue
        }
      }

      // Get player FCM tokens
      const playerSnap = await adminDb
        .collection('clubs').doc(clubId)
        .collection('players').doc(playerId)
        .get()

      if (!playerSnap.exists) {
        failed++
        continue
      }

      const tokens: string[] = playerSnap.data()?.fcmTokens ?? []
      if (tokens.length === 0) {
        failed++
        continue
      }

      // Send push
      try {
        const result = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: 'Bitte um Rückmeldung',
            body: `${eventTitle} am ${dateStr}`,
          },
          webpush: {
            fcmOptions: { link: '/mein-bereich' },
          },
        })

        if (result.successCount > 0) {
          sent++
          // Track reminder
          await remindersRef.doc(playerId).set({
            lastSentAt: FieldValue.serverTimestamp(),
            count: FieldValue.increment(1),
          }, { merge: true })
        } else {
          failed++
        }

        // Clean up invalid tokens
        const invalidTokens: string[] = []
        result.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
              invalidTokens.push(tokens[idx])
            }
          }
        })
        if (invalidTokens.length > 0) {
          await playerSnap.ref.update({
            fcmTokens: FieldValue.arrayRemove(...invalidTokens),
          })
        }
      } catch {
        failed++
      }
    }

    return NextResponse.json({ sent, skipped, failed })
  } catch (error) {
    console.error('[notifications/remind POST]', error)
    return NextResponse.json({ error: 'Erinnerung fehlgeschlagen' }, { status: 500 })
  }
}

import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

// Init once
if (!admin.apps.length) {
  admin.initializeApp()
}

const db = getFirestore()
const messaging = getMessaging()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' })
}

/**
 * Send push to all FCM tokens of given playerIds.
 * Automatically removes invalid tokens from Firestore.
 */
async function sendPushToPlayers(
  clubId: string,
  playerIds: string[],
  title: string,
  body: string,
  url = '/mein-bereich'
): Promise<{ sent: number; failed: number }> {
  if (playerIds.length === 0) return { sent: 0, failed: 0 }

  const BATCH = 30
  type TokenEntry = { token: string; playerId: string }
  const allTokens: TokenEntry[] = []

  for (let i = 0; i < playerIds.length; i += BATCH) {
    const batch = playerIds.slice(i, i + BATCH)
    const snap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('players')
      .where(admin.firestore.FieldPath.documentId(), 'in', batch)
      .get()

    for (const d of snap.docs) {
      const tokens: string[] = d.data().fcmTokens ?? []
      tokens.forEach(t => allTokens.push({ token: t, playerId: d.id }))
    }
  }

  if (allTokens.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const invalidTokens: TokenEntry[] = []
  const FCM_BATCH = 500

  for (let i = 0; i < allTokens.length; i += FCM_BATCH) {
    const batch = allTokens.slice(i, i + FCM_BATCH)
    const result = await messaging.sendEachForMulticast({
      tokens: batch.map(t => t.token),
      notification: { title, body },
      webpush: { fcmOptions: { link: url } },
    })
    sent += result.successCount
    failed += result.failureCount
    result.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          invalidTokens.push(batch[idx])
        }
      }
    })
  }

  // Cleanup invalid tokens
  if (invalidTokens.length > 0) {
    await Promise.allSettled(
      invalidTokens.map(({ token, playerId }) =>
        db.collection('clubs').doc(clubId).collection('players').doc(playerId).update({
          fcmTokens: FieldValue.arrayRemove(token),
        })
      )
    )
  }

  return { sent, failed }
}

/**
 * Get player IDs for a list of teamIds who haven't responded to an event.
 */
async function getPendingPlayerIds(clubId: string, eventId: string, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return []

  const BATCH = 10
  const playerIds = new Set<string>()

  for (let i = 0; i < teamIds.length; i += BATCH) {
    const batch = teamIds.slice(i, i + BATCH)
    const snap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('players')
      .where('teamIds', 'array-contains-any', batch)
      .where('accountStatus', '==', 'active')
      .get()
    snap.docs.forEach(d => playerIds.add(d.id))
  }

  // Remove players who already responded
  const responsesSnap = await db
    .collection('clubs')
    .doc(clubId)
    .collection('events')
    .doc(eventId)
    .collection('responses')
    .get()

  responsesSnap.docs.forEach(d => playerIds.delete(d.id))

  return Array.from(playerIds)
}

// ─── Function 1: Daily 08:00 – 24h reminder ──────────────────────────────────

export const dailyEventReminder = onSchedule(
  {
    schedule: '0 8 * * *',       // Daily at 08:00
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
  },
  async () => {
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    // ±30 min window
    const windowStart = new Date(in24h.getTime() - 30 * 60 * 1000)
    const windowEnd = new Date(in24h.getTime() + 30 * 60 * 1000)

    // Query all clubs (in production, add pagination for >100 clubs)
    const clubsSnap = await db.collection('clubs').get()

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id

      const eventsSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('events')
        .where('startDate', '>=', Timestamp.fromDate(windowStart))
        .where('startDate', '<=', Timestamp.fromDate(windowEnd))
        .get()

      for (const eventDoc of eventsSnap.docs) {
        const event = eventDoc.data()
        const startDate = (event.startDate as Timestamp).toDate()
        const pendingPlayerIds = await getPendingPlayerIds(clubId, eventDoc.id, event.teamIds ?? [])

        if (pendingPlayerIds.length > 0) {
          await sendPushToPlayers(
            clubId,
            pendingPlayerIds,
            `Erinnerung: ${event.title}`,
            `Morgen um ${formatTime(startDate)} – Kannst du kommen?`,
            '/mein-bereich'
          )
        }
      }
    }
  }
)

// ─── Function 2: Hourly – 2h reminder ───────────────────────────────────────

export const hourlyEventReminder = onSchedule(
  {
    schedule: '0 * * * *',       // Every hour on the hour
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
  },
  async () => {
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const windowStart = new Date(in2h.getTime() - 30 * 60 * 1000)
    const windowEnd = new Date(in2h.getTime() + 30 * 60 * 1000)

    const clubsSnap = await db.collection('clubs').get()

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id

      const eventsSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('events')
        .where('startDate', '>=', Timestamp.fromDate(windowStart))
        .where('startDate', '<=', Timestamp.fromDate(windowEnd))
        .where('reminders2hSent', '!=', true)
        .get()

      for (const eventDoc of eventsSnap.docs) {
        const event = eventDoc.data()
        const startDate = (event.startDate as Timestamp).toDate()
        const pendingPlayerIds = await getPendingPlayerIds(clubId, eventDoc.id, event.teamIds ?? [])

        if (pendingPlayerIds.length > 0) {
          await sendPushToPlayers(
            clubId,
            pendingPlayerIds,
            `Heute um ${formatTime(startDate)}: ${event.title}`,
            `Bist du dabei? Jetzt zu- oder absagen.`,
            '/mein-bereich'
          )
        }

        // Mark as reminded regardless of pending count (avoid re-sending)
        await eventDoc.ref.update({ reminders2hSent: true })
      }
    }
  }
)

// ─── Function 3: Firestore trigger – event cancelled ─────────────────────────

export const onEventCancelled = onDocumentUpdated(
  {
    document: 'clubs/{clubId}/events/{eventId}',
    region: 'europe-west1',
  },
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()

    if (!before || !after) return

    // Only trigger if status changed from 'scheduled' to 'cancelled'
    if (before.status === 'cancelled' || after.status !== 'cancelled') return

    const clubId = event.params.clubId
    const teamIds: string[] = after.teamIds ?? []
    const cancelReason: string = after.cancelReason ?? ''

    // Get all active players in the affected teams
    const BATCH = 10
    const playerIds = new Set<string>()

    for (let i = 0; i < teamIds.length; i += BATCH) {
      const batch = teamIds.slice(i, i + BATCH)
      const snap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('players')
        .where('teamIds', 'array-contains-any', batch)
        .where('accountStatus', '==', 'active')
        .get()
      snap.docs.forEach(d => playerIds.add(d.id))
    }

    if (playerIds.size === 0) return

    const title = `❌ Abgesagt: ${after.title}`
    const body = cancelReason ? cancelReason : `${formatDateShort((after.startDate as Timestamp).toDate())} wurde abgesagt.`

    await sendPushToPlayers(clubId, Array.from(playerIds), title, body, '/mein-bereich')
  }
)

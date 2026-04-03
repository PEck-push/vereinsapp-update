import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
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
      .collection('clubs').doc(clubId).collection('players')
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

async function getPendingPlayerIds(clubId: string, eventId: string, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return []

  const BATCH = 10
  const playerIds = new Set<string>()

  for (let i = 0; i < teamIds.length; i += BATCH) {
    const batch = teamIds.slice(i, i + BATCH)
    const snap = await db
      .collection('clubs').doc(clubId).collection('players')
      .where('teamIds', 'array-contains-any', batch)
      .where('accountStatus', '==', 'active')
      .get()
    snap.docs.forEach(d => playerIds.add(d.id))
  }

  const responsesSnap = await db
    .collection('clubs').doc(clubId).collection('events').doc(eventId).collection('responses')
    .get()
  responsesSnap.docs.forEach(d => playerIds.delete(d.id))

  return Array.from(playerIds)
}

// ─── Function 1: Daily 08:00 – 24h reminder ──────────────────────────────────

export const dailyEventReminder = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Europe/Vienna', region: 'europe-west1' },
  async () => {
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const windowStart = new Date(in24h.getTime() - 30 * 60 * 1000)
    const windowEnd = new Date(in24h.getTime() + 30 * 60 * 1000)

    const clubsSnap = await db.collection('clubs').get()
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id
      const eventsSnap = await db
        .collection('clubs').doc(clubId).collection('events')
        .where('startDate', '>=', Timestamp.fromDate(windowStart))
        .where('startDate', '<=', Timestamp.fromDate(windowEnd))
        .get()

      for (const eventDoc of eventsSnap.docs) {
        const event = eventDoc.data()
        const startDate = (event.startDate as Timestamp).toDate()
        const pendingPlayerIds = await getPendingPlayerIds(clubId, eventDoc.id, event.teamIds ?? [])
        if (pendingPlayerIds.length > 0) {
          await sendPushToPlayers(clubId, pendingPlayerIds, `Erinnerung: ${event.title}`, `Morgen um ${formatTime(startDate)} – Kannst du kommen?`, '/mein-bereich')
        }
      }
    }
  }
)

// ─── Function 2: Hourly – 2h reminder ───────────────────────────────────────

export const hourlyEventReminder = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Europe/Vienna', region: 'europe-west1' },
  async () => {
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const windowStart = new Date(in2h.getTime() - 30 * 60 * 1000)
    const windowEnd = new Date(in2h.getTime() + 30 * 60 * 1000)

    const clubsSnap = await db.collection('clubs').get()
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id
      const eventsSnap = await db
        .collection('clubs').doc(clubId).collection('events')
        .where('startDate', '>=', Timestamp.fromDate(windowStart))
        .where('startDate', '<=', Timestamp.fromDate(windowEnd))
        .where('reminders2hSent', '!=', true)
        .get()

      for (const eventDoc of eventsSnap.docs) {
        const event = eventDoc.data()
        const startDate = (event.startDate as Timestamp).toDate()
        const pendingPlayerIds = await getPendingPlayerIds(clubId, eventDoc.id, event.teamIds ?? [])
        if (pendingPlayerIds.length > 0) {
          await sendPushToPlayers(clubId, pendingPlayerIds, `Heute um ${formatTime(startDate)}: ${event.title}`, `Bist du dabei? Jetzt zu- oder absagen.`, '/mein-bereich')
        }
        await eventDoc.ref.update({ reminders2hSent: true })
      }
    }
  }
)

// ─── Function 3: Firestore trigger – event cancelled ─────────────────────────

export const onEventCancelled = onDocumentUpdated(
  { document: 'clubs/{clubId}/events/{eventId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!before || !after) return
    if (before.status === 'cancelled' || after.status !== 'cancelled') return

    const clubId = event.params.clubId
    const teamIds: string[] = after.teamIds ?? []
    const cancelReason: string = after.cancelReason ?? ''

    const BATCH = 10
    const playerIds = new Set<string>()
    for (let i = 0; i < teamIds.length; i += BATCH) {
      const batch = teamIds.slice(i, i + BATCH)
      const snap = await db
        .collection('clubs').doc(clubId).collection('players')
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TELEGRAM BOT ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

import { handleWebhook } from './telegram/webhook'
import { runWeeklyDigest } from './telegram/weeklyPost'

/**
 * Telegram Webhook Endpoint.
 *
 * After deploying, register the webhook with Telegram:
 * curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>"
 *
 * Required env vars:
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_BOT_USERNAME (without @)
 * - CLUB_ID (or NEXT_PUBLIC_CLUB_ID)
 */
export const telegramWebhook = onRequest(
  { region: 'europe-west1', maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    try {
      await handleWebhook(req.body)
      res.status(200).send('ok')
    } catch (err) {
      console.error('[telegramWebhook] Unhandled error:', err)
      // Always return 200 to Telegram — otherwise it retries
      res.status(200).send('ok')
    }
  }
)

/**
 * Weekly Telegram Digest — Monday 08:00 Vienna time.
 * Posts event summaries with response buttons to all linked team groups.
 */
export const weeklyTelegramDigest = onSchedule(
  {
    schedule: '0 8 * * 1', // Monday 08:00
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
  },
  async () => {
    await runWeeklyDigest()
  }
)

// ─── ÖFBL Schedule Sync — Monday 06:00 ──────────────────────────────────────

// ─── ÖFBL Result Sync — Hourly ──────────────────────────────────────────────

export const hourlyResultSync = onSchedule(
  {
    schedule: '0 * * * *', // Every hour
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
  },
  async () => {
    const clubsSnap = await db.collection('clubs').get()
    let requestCount = 0
    const MAX_REQUESTS_PER_MINUTE = 10

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id
      const clubName = clubDoc.data().name ?? ''

      // Find matches that ended ~90min ago (status=scheduled, startDate < now - 90min)
      const cutoff = new Date(Date.now() - 90 * 60 * 1000)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000) // Don't look back more than 24h

      const eventsSnap = await db
        .collection('clubs').doc(clubId).collection('events')
        .where('type', '==', 'match')
        .where('status', '==', 'scheduled')
        .where('startDate', '>=', Timestamp.fromDate(dayAgo))
        .where('startDate', '<=', Timestamp.fromDate(cutoff))
        .get()

      for (const eventDoc of eventsSnap.docs) {
        if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
          console.log('[hourlyResultSync] Rate limit reached, stopping.')
          return
        }

        const event = eventDoc.data()
        const oefblMatchId = event.oefblMatchId as string | undefined
        if (!oefblMatchId) continue

        // Find team's ÖFBL URL
        const teamId = (event.teamIds as string[])?.[0]
        if (!teamId) continue

        const teamDoc = await db
          .collection('clubs').doc(clubId).collection('teams').doc(teamId)
          .get()
        const team = teamDoc.data()
        const oefblUrl = team?.oefblUrl as string | undefined
        if (!oefblUrl) continue

        try {
          requestCount++
          const res = await fetch(oefblUrl, {
            headers: { 'User-Agent': 'VereinsPWA/1.0 (Result-Sync)', Accept: 'text/html' },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) continue

          const html = await res.text()

          // Simple result extraction: look for score pattern near the match ID context
          const scoreRegex = /(\d{1,2})\s*:\s*(\d{1,2})/g
          let matchResult: { goalsFor: number; goalsAgainst: number } | null = null

          // Try to find a result in the page that correlates with this match
          // This is a simplified approach — a full implementation would match by date+opponent
          const startDate = (event.startDate as Timestamp).toDate()
          const dateStr = `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}`

          // Look for the date in the HTML and extract nearby score
          const dateIndex = html.indexOf(dateStr)
          if (dateIndex !== -1) {
            const vicinity = html.slice(dateIndex, dateIndex + 500)
            const scoreMatch = vicinity.match(/(\d{1,2})\s*:\s*(\d{1,2})/)
            if (scoreMatch) {
              // Determine if home or away to assign goalsFor/Against correctly
              const title = event.title as string
              const isHome = !title.toLowerCase().startsWith('vs.')
              const score1 = parseInt(scoreMatch[1])
              const score2 = parseInt(scoreMatch[2])

              matchResult = {
                goalsFor: isHome ? score1 : score2,
                goalsAgainst: isHome ? score2 : score1,
              }
            }
          }

          if (!matchResult) continue

          // Extract opponent from event title
          const opponent = (event.title as string).replace(/^vs\.\s*/i, '')

          // Write matchStats
          await db.collection('clubs').doc(clubId).collection('matchStats').add({
            eventId: eventDoc.id,
            teamId,
            clubId,
            opponent,
            homeOrAway: (event.title as string).toLowerCase().startsWith('vs.') ? 'away' : 'home',
            result: matchResult,
            playerMinutes: [], // No player minutes from auto-sync
            source: 'oefbl_auto',
            createdAt: FieldValue.serverTimestamp(),
          })

          // Update event status
          await eventDoc.ref.update({
            status: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
          })

          // Notify admin
          const adminSnap = await db
            .collection('clubs').doc(clubId).collection('adminUsers')
            .limit(3)
            .get()
          const adminIds = adminSnap.docs.map(d => d.id)

          if (adminIds.length > 0) {
            await sendPushToPlayers(
              clubId,
              adminIds,
              `Ergebnis ${matchResult.goalsFor}:${matchResult.goalsAgainst} gegen ${opponent}`,
              'Automatisch eingetragen — Spielbericht noch ausstehend',
              '/stats/games'
            )
          }

          console.log(`[hourlyResultSync] Result ${matchResult.goalsFor}:${matchResult.goalsAgainst} for ${eventDoc.id}`)
        } catch (err) {
          console.error(`[hourlyResultSync] Error for event ${eventDoc.id}:`, err)
        }
      }
    }
  }
)

// ─── ÖFBL Schedule Sync — Monday 06:00 ──────────────────────────────────────

export const weeklyOefblSync = onSchedule(
  {
    schedule: '0 6 * * 1', // Monday 06:00
    timeZone: 'Europe/Vienna',
    region: 'europe-west1',
  },
  async () => {
    const clubsSnap = await db.collection('clubs').get()

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id
      const clubName = clubDoc.data().name ?? ''

      const teamsSnap = await db
        .collection('clubs').doc(clubId).collection('teams')
        .where('oefblUrl', '!=', '')
        .get()

      for (const teamDoc of teamsSnap.docs) {
        const team = teamDoc.data()
        const oefblUrl = team.oefblUrl as string

        try {
          console.log(`[weeklyOefblSync] Syncing ${team.name} (${clubId}) from ${oefblUrl}`)

          // Call the import API internally
          const res = await fetch(oefblUrl, {
            headers: { 'User-Agent': 'VereinsPWA/1.0 (Auto-Sync)', Accept: 'text/html' },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            console.error(`[weeklyOefblSync] HTTP ${res.status} for ${oefblUrl}`)
            continue
          }

          // We'd need the parsing logic here, but since it's in the Next.js API,
          // we log a simple status. Full sync uses the API route via admin calls.
          console.log(`[weeklyOefblSync] Fetched ${team.name} page successfully — use /api/oefbl/import for full sync`)

        } catch (err) {
          console.error(`[weeklyOefblSync] Error syncing ${team.name}:`, err)
        }
      }
    }
  }
)
/**
 * Weekly Telegram Digest — Scheduled for Monday 08:00 Europe/Vienna.
 *
 * For each team that has a Telegram group linked:
 * 1. Query events for the current week (Mon 00:00 – Sun 23:59)
 * 2. Post one message per event with inline accept/decline buttons
 * 3. Store the Telegram message ID on the event for later updates
 *
 * Also posts a header message summarizing the week.
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { sendMessage } from './api'
import {
  formatEventMessage,
  formatWeeklyHeader,
  buildEventButtons,
} from './formatting'

const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? process.env.CLUB_ID ?? 'default-club'

export async function runWeeklyDigest(): Promise<void> {
  const db = getFirestore()

  // ── 1. Find all teams with Telegram groups ──
  const teamsSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('teams')
    .get()

  const linkedTeams = teamsSnap.docs.filter(d => d.data().telegramGroupId)

  if (linkedTeams.length === 0) {
    console.log('[weeklyDigest] No teams with Telegram groups.')
    return
  }

  // ── 2. Determine week boundaries (Mon 00:00 – Sun 23:59 Vienna time) ──
  const now = new Date()
  const monday = getMonday(now)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const mondayTs = Timestamp.fromDate(monday)
  const sundayTs = Timestamp.fromDate(sunday)

  // ── 3. Process each team ──
  for (const teamDoc of linkedTeams) {
    const teamData = teamDoc.data()
    const teamId = teamDoc.id
    const chatId = teamData.telegramGroupId as number
    const teamName = teamData.name as string

    try {
      // Query events for this team this week
      const eventsSnap = await db
        .collection('clubs').doc(CLUB_ID)
        .collection('events')
        .where('teamIds', 'array-contains', teamId)
        .where('startDate', '>=', mondayTs)
        .where('startDate', '<=', sundayTs)
        .where('status', '==', 'scheduled')
        .get()

      // Also include club-wide events (empty teamIds)
      const clubEventsSnap = await db
        .collection('clubs').doc(CLUB_ID)
        .collection('events')
        .where('teamIds', '==', [])
        .where('startDate', '>=', mondayTs)
        .where('startDate', '<=', sundayTs)
        .where('status', '==', 'scheduled')
        .get()

      // Merge and deduplicate
      const eventMap = new Map<string, FirebaseFirestore.DocumentSnapshot>()
      eventsSnap.docs.forEach(d => eventMap.set(d.id, d))
      clubEventsSnap.docs.forEach(d => eventMap.set(d.id, d))

      const allEvents = Array.from(eventMap.values())
        .sort((a, b) => {
          const aDate = (a.data()?.startDate as Timestamp).toDate()
          const bDate = (b.data()?.startDate as Timestamp).toDate()
          return aDate.getTime() - bDate.getTime()
        })

      if (allEvents.length === 0) {
        await sendMessage(chatId, [
          `📅 <b>Wochenvorschau — ${teamName}</b>`,
          '',
          '🎉 Keine Termine diese Woche. Genießt die freie Zeit!',
        ].join('\n'))
        continue
      }

      // ── Post header ──
      await sendMessage(chatId, formatWeeklyHeader(teamName, allEvents.length))

      // Small delay between messages to avoid rate limiting
      await sleep(300)

      // ── Post individual event messages ──
      // Count eligible players for this team
      const playersSnap = await db
        .collection('clubs').doc(CLUB_ID)
        .collection('players')
        .where('teamIds', 'array-contains', teamId)
        .where('status', 'in', ['active', 'injured'])
        .get()
      const totalPlayers = playersSnap.docs.length

      for (const eventDoc of allEvents) {
        const event = eventDoc.data()!
        const eventId = eventDoc.id
        const startDate = (event.startDate as Timestamp).toDate()
        const endDate = event.endDate ? (event.endDate as Timestamp).toDate() : undefined

        // Load existing responses
        const responsesSnap = await db
          .collection('clubs').doc(CLUB_ID)
          .collection('events').doc(eventId)
          .collection('responses')
          .get()

        // Build player name lookup for existing responses
        const playerIds = responsesSnap.docs.map(d => d.id)
        const playerNames: Record<string, string> = {}

        for (let i = 0; i < playerIds.length; i += 30) {
          const batch = playerIds.slice(i, i + 30)
          if (batch.length === 0) continue
          const pSnap = await db
            .collection('clubs').doc(CLUB_ID)
            .collection('players')
            .where('__name__', 'in', batch)
            .get()
          for (const pDoc of pSnap.docs) {
            const p = pDoc.data()
            playerNames[pDoc.id] = `${p.firstName} ${p.lastName?.[0] ?? ''}.`
          }
        }

        const accepted = responsesSnap.docs
          .filter(d => d.data().status === 'accepted')
          .map(d => ({ name: playerNames[d.id] ?? d.id }))

        const declined = responsesSnap.docs
          .filter(d => d.data().status === 'declined')
          .map(d => ({
            name: playerNames[d.id] ?? d.id,
            category: d.data().declineCategory,
          }))

        const pendingCount = Math.max(0, totalPlayers - accepted.length - declined.length)

        // Format message
        const text = formatEventMessage(
          { id: eventId, title: event.title, type: event.type, startDate, endDate, location: event.location },
          { accepted, declined, pendingCount },
          teamName
        )

        // Send with buttons
        const sent = await sendMessage(chatId, text, {
          inlineKeyboard: buildEventButtons(eventId),
        })

        // Store message reference for later updates
        if (sent) {
          await db
            .collection('clubs').doc(CLUB_ID)
            .collection('events').doc(eventId)
            .update({
              [`telegramMessages.${chatId}`]: {
                messageId: sent.message_id,
                chatId,
                postedAt: FieldValue.serverTimestamp(),
              },
            })
        }

        await sleep(500) // Respect rate limits between messages
      }

      console.log(`[weeklyDigest] Posted ${allEvents.length} events for ${teamName}`)
    } catch (err) {
      console.error(`[weeklyDigest] Error for team ${teamName}:`, err)
      // Continue with next team even if one fails
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
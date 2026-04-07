/**
 * Handles event response callbacks from Telegram inline buttons.
 *
 * Flow:
 * 1. Player taps ✅/❌ → callback arrives here
 * 2. Verify player is linked (has telegramUserId)
 * 3. Write response to Firestore (same structure as app)
 * 4. Update the Telegram message with new counts + names
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './db'
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  type TelegramCallbackQuery,
} from './api'
import { findPlayerByTelegramId } from './phoneMatch'
import {
  formatEventMessage,
  buildEventButtons,
  buildDeclineCategoryButtons,
} from './formatting'

const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? process.env.CLUB_ID ?? 'default-club'

/**
 * Handle a response callback: r:EVENT_ID:a (accept) or r:EVENT_ID:d (decline)
 */
export async function handleResponseCallback(
  callback: TelegramCallbackQuery,
  eventId: string,
  action: string
): Promise<void> {

  const telegramUserId = callback.from.id

  // 1. Find the linked player
  const player = await findPlayerByTelegramId(CLUB_ID, telegramUserId)

  if (!player) {
    await answerCallbackQuery(
      callback.id,
      '❌ Du bist noch nicht verknüpft. Schreib dem Bot eine DM und teile deine Telefonnummer.'
    )
    return
  }

  // 2. Handle the action
  if (action === 'a') {
    // Accept
    await writeResponse(eventId, player.playerId, 'accepted')
    await answerCallbackQuery(callback.id, `✅ ${player.playerName} — Zugesagt!`)
  } else if (action === 'd') {
    // Show decline category selection
    if (callback.message) {
      await editMessageText(
        callback.message.chat.id,
        callback.message.message_id,
        callback.message.text
          ? `${callback.message.text}\n\n🔽 <b>${player.playerName}</b>, warum kannst du nicht?`
          : 'Warum kannst du nicht?',
        buildDeclineCategoryButtons(eventId)
      )
    }
    await answerCallbackQuery(callback.id)
    return // Don't update the main message yet — wait for category selection
  } else if (action === 'back') {
    // Back from category selection → restore original message with event buttons
    if (callback.message) {
      await refreshEventMessage(
        eventId,
        callback.message.chat.id,
        callback.message.message_id
      )
    }
    await answerCallbackQuery(callback.id)
    return
  }

  // 3. Refresh the event message with updated responses
  if (callback.message) {
    await refreshEventMessage(
      eventId,
      callback.message.chat.id,
      callback.message.message_id
    )
  }
}

/**
 * Handle a decline category callback: c:EVENT_ID:injury/work/private
 */
export async function handleCategoryCallback(
  callback: TelegramCallbackQuery,
  eventId: string,
  category: string
): Promise<void> {
  const telegramUserId = callback.from.id

  const player = await findPlayerByTelegramId(CLUB_ID, telegramUserId)
  if (!player) {
    await answerCallbackQuery(callback.id, '❌ Nicht verknüpft.')
    return
  }

  // Write declined response with category
  await writeResponse(eventId, player.playerId, 'declined', category)
  await answerCallbackQuery(callback.id, `❌ ${player.playerName} — Abgesagt`)

  // Refresh the event message
  if (callback.message) {
    await refreshEventMessage(
      eventId,
      callback.message.chat.id,
      callback.message.message_id
    )
  }
}

// ─── Firestore Write ──────────────────────────────────────────────────────────

async function writeResponse(
  eventId: string,
  playerId: string,
  status: 'accepted' | 'declined',
  declineCategory?: string
): Promise<void> {

  const responseRef = db
    .collection('clubs').doc(CLUB_ID)
    .collection('events').doc(eventId)
    .collection('responses').doc(playerId)

  const eventRef = db
    .collection('clubs').doc(CLUB_ID)
    .collection('events').doc(eventId)

  // Check previous response
  const existing = await responseRef.get()
  const previousStatus = existing.exists ? (existing.data()?.status as string) : null

  // Write/update response
  const responseData: Record<string, unknown> = {
    playerId,
    status,
    respondedAt: FieldValue.serverTimestamp(),
    source: 'telegram',
  }
  if (declineCategory) {
    responseData.declineCategory = declineCategory
  }

  await responseRef.set(responseData, { merge: true })

  // Update event response counters
  if (!previousStatus) {
    // New response
    await eventRef.update({
      [`responseCount.${status}`]: FieldValue.increment(1),
      'responseCount.total': FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else if (previousStatus !== status) {
    // Changed response
    await eventRef.update({
      [`responseCount.${previousStatus}`]: FieldValue.increment(-1),
      [`responseCount.${status}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

// ─── Message Refresh ──────────────────────────────────────────────────────────

/**
 * Rebuild and update a Telegram event message with current response data.
 */
async function refreshEventMessage(
  eventId: string,
  chatId: number,
  messageId: number
): Promise<void> {


  // Load event
  const eventSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('events').doc(eventId)
    .get()

  if (!eventSnap.exists) return
  const event = eventSnap.data()!
  const startDate = (event.startDate as Timestamp).toDate()
  const endDate = event.endDate ? (event.endDate as Timestamp).toDate() : undefined

  // Load responses
  const responsesSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('events').doc(eventId)
    .collection('responses')
    .get()

  // Load player names for response display
  const playerIds = responsesSnap.docs.map(d => d.id)
  const playerNames: Record<string, string> = {}

  // Batch load player names (max 30 per query)
  for (let i = 0; i < playerIds.length; i += 30) {
    const batch = playerIds.slice(i, i + 30)
    const playersSnap = await db
      .collection('clubs').doc(CLUB_ID)
      .collection('players')
      .where('__name__', 'in', batch)
      .get()

    for (const pDoc of playersSnap.docs) {
      const p = pDoc.data()
      playerNames[pDoc.id] = `${p.firstName} ${p.lastName?.[0] ?? ''}.`
    }
  }

  // Count total eligible players for this event
  const teamIds = event.teamIds as string[] ?? []
  let totalPlayers = 0

  if (teamIds.length > 0) {
    for (let i = 0; i < teamIds.length; i += 10) {
      const batch = teamIds.slice(i, i + 10)
      const pSnap = await db
        .collection('clubs').doc(CLUB_ID)
        .collection('players')
        .where('teamIds', 'array-contains-any', batch)
        .where('status', 'in', ['active', 'injured'])
        .get()
      // Deduplicate
      const ids = new Set<string>()
      pSnap.docs.forEach(d => ids.add(d.id))
      totalPlayers = ids.size
    }
  }

  // Build response summary
  const accepted: { name: string }[] = []
  const declined: { name: string; category?: string }[] = []

  for (const doc of responsesSnap.docs) {
    const data = doc.data()
    const name = playerNames[doc.id] ?? doc.id

    if (data.status === 'accepted') {
      accepted.push({ name })
    } else if (data.status === 'declined') {
      declined.push({ name, category: data.declineCategory })
    }
  }

  const pendingCount = Math.max(0, totalPlayers - accepted.length - declined.length)

  // Find team name
  let teamName: string | undefined
  if (teamIds.length > 0) {
    const teamSnap = await db
      .collection('clubs').doc(CLUB_ID)
      .collection('teams').doc(teamIds[0])
      .get()
    teamName = teamSnap.data()?.name
  }

  // Format and update
  const text = formatEventMessage(
    {
      id: eventId,
      title: event.title,
      type: event.type,
      startDate,
      endDate,
      location: event.location,
    },
    { accepted, declined, pendingCount },
    teamName
  )

  await editMessageText(chatId, messageId, text, buildEventButtons(eventId))
}
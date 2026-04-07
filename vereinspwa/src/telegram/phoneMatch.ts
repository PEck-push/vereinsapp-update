/**
 * Phone number normalization and player matching.
 *
 * Telegram sends phone numbers in E.164 format: +436641234567
 * Players in Firestore may have: "0664 123 456", "+43 664 1234567", "0664/1234567"
 *
 * Strategy: Normalize both sides to digits-only, then compare.
 * Default country code: +43 (Austria). Configurable per club later.
 */

import { db } from './db'

const DEFAULT_COUNTRY_CODE = '43' // Austria

/**
 * Normalize a phone number to a comparable format: country code + digits.
 * Examples:
 *   "0664 123 456"      → "43664123456"
 *   "+43 664 1234567"   → "436641234567"
 *   "+436641234567"     → "436641234567"
 *   "0043 664 123 456"  → "43664123456"
 */
export function normalizePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  // Strip everything except digits and leading +
  let cleaned = raw.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+')) {
    // International format: +436641234567 → 436641234567
    cleaned = cleaned.substring(1)
  } else if (cleaned.startsWith('00')) {
    // Alternative international: 00436641234567 → 436641234567
    cleaned = cleaned.substring(2)
  } else if (cleaned.startsWith('0')) {
    // National format: 06641234567 → 436641234567
    cleaned = countryCode + cleaned.substring(1)
  }

  return cleaned
}

/**
 * Find a player by matching their phone number.
 * Returns the player document ID if found, null otherwise.
 */
export async function findPlayerByPhone(
  clubId: string,
  telegramPhone: string,
  teamIds?: string[]
): Promise<{ playerId: string; playerName: string } | null> {

  const normalizedTelegram = normalizePhone(telegramPhone)

  if (normalizedTelegram.length < 8) {
    return null // Too short to be a valid phone number
  }

  // Query all active players (with optional team filter)
  let playersQuery = db
    .collection('clubs')
    .doc(clubId)
    .collection('players')
    .where('accountStatus', 'in', ['active', 'invited'])

  const snap = await playersQuery.get()

  for (const doc of snap.docs) {
    const data = doc.data()
    const storedPhone = data.phone as string | undefined

    if (!storedPhone) continue

    const normalizedStored = normalizePhone(storedPhone)

    // Compare normalized versions
    if (normalizedStored === normalizedTelegram) {
      // If teamIds filter is provided, check membership
      if (teamIds && teamIds.length > 0) {
        const playerTeams = data.teamIds as string[] ?? []
        if (!teamIds.some(id => playerTeams.includes(id))) continue
      }

      return {
        playerId: doc.id,
        playerName: `${data.firstName} ${data.lastName}`,
      }
    }
  }

  return null
}

/**
 * Link a Telegram user to a player document.
 */
export async function linkTelegramToPlayer(
  clubId: string,
  playerId: string,
  telegramUserId: number,
  telegramUsername?: string
): Promise<void> {

  await db
    .collection('clubs')
    .doc(clubId)
    .collection('players')
    .doc(playerId)
    .update({
      telegramUserId,
      ...(telegramUsername && { telegramUsername }),
    })
}

/**
 * Find a player by their Telegram user ID.
 */
export async function findPlayerByTelegramId(
  clubId: string,
  telegramUserId: number
): Promise<{ playerId: string; playerName: string } | null> {


  const snap = await db
    .collection('clubs')
    .doc(clubId)
    .collection('players')
    .where('telegramUserId', '==', telegramUserId)
    .limit(1)
    .get()

  if (snap.empty) return null

  const doc = snap.docs[0]
  const data = doc.data()
  return {
    playerId: doc.id,
    playerName: `${data.firstName} ${data.lastName}`,
  }
}
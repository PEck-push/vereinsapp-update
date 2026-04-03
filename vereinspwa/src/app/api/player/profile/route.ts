/**
 * /api/player/profile
 *
 * GET  → returns the authenticated player's own profile
 * PATCH → updates allowed fields only (phone, notificationPrefs, fcmTokens)
 *
 * Uses session cookie to identify the player – no playerId in URL
 * to prevent horizontal privilege escalation.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

async function getPlayerFromSession() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value

  if (!sessionCookie) return null

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const uid = decoded.uid
    const clubId = await getClubIdFromSession()
    if (!clubId) return null

    // Find player doc by UID
    const snap = await adminDb
      .collection('clubs')
      .doc(clubId)
      .collection('players')
      .where('uid', '==', uid)
      .limit(1)
      .get()

    if (snap.empty) return null

    const doc = snap.docs[0]
    return { id: doc.id, clubId, ...doc.data() }
  } catch {
    return null
  }
}

export async function GET() {
  const player = await getPlayerFromSession()
  if (!player) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  // Strip sensitive server-only fields before sending to client
  const { inviteToken, ...safePlayer } = player as Record<string, unknown>
  void inviteToken // suppress unused warning

  return NextResponse.json(safePlayer)
}

export async function PATCH(request: NextRequest) {
  const player = await getPlayerFromSession() as Record<string, unknown> | null
  if (!player) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Whitelist: players may ONLY update these fields
    const allowed = ['phone', 'notificationPrefs', 'fcmTokens', 'photoUrl']
    const updates: Record<string, unknown> = {}

    for (const key of allowed) {
      if (key in body) {
        updates[key] = body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Keine gültigen Felder' }, { status: 400 })
    }

    updates.updatedAt = FieldValue.serverTimestamp()

    await adminDb
      .collection('clubs')
      .doc(player.clubId as string)
      .collection('players')
      .doc(player.id as string)
      .update(updates)

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[player/profile PATCH]', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

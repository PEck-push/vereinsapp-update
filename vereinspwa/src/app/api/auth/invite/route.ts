import { adminDb } from '@/lib/firebase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { CLUB_ID } from '@/lib/config'
// Note: auth/invite uses static CLUB_ID since it's an unauthenticated endpoint
// (invite tokens are verified by hash, not session). In multi-tenant mode,
// the clubId would need to be embedded in the invite URL itself.

async function sha256(text: string): Promise<string> {
  const { createHash } = await import('crypto')
  return createHash('sha256').update(text).digest('hex')
}

/**
 * POST /api/auth/invite
 * Body: { token: string }
 * Returns: { firstName, email, playerId } or error
 *
 * Security: Token is validated server-side. Only the hash is stored in Firestore.
 * The plain token never touches the DB.
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
    }

    const hash = await sha256(token)

    const playersRef = adminDb.collection('clubs').doc(CLUB_ID).collection('players')

    // Query by hashed token
    const snap = await playersRef
      .where('inviteToken', '==', hash)
      .where('inviteTokenUsed', '==', false)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json(
        { error: 'Dieser Einladungslink ist ungültig oder bereits verwendet.' },
        { status: 404 }
      )
    }

    const playerDoc = snap.docs[0]
    const player = playerDoc.data()

    // Check expiry
    const expiry = player.inviteTokenExpiry?.toDate?.() ?? null
    if (!expiry || expiry < new Date()) {
      return NextResponse.json(
        { error: 'Dieser Einladungslink ist abgelaufen. Bitte den Admin kontaktieren.' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      playerId: playerDoc.id,
      firstName: player.firstName,
      email: player.email,
    })
  } catch (error) {
    console.error('[invite POST]', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

/**
 * PATCH /api/auth/invite
 * Body: { playerId: string, uid: string }
 * Called after Firebase Auth account is created client-side.
 * Marks token as used and activates account.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { playerId, uid } = await request.json()

    if (!playerId || !uid) {
      return NextResponse.json({ error: 'playerId und uid benötigt' }, { status: 400 })
    }

    const playerRef = adminDb
      .collection('clubs')
      .doc(CLUB_ID)
      .collection('players')
      .doc(playerId)

    const snap = await playerRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Spieler nicht gefunden' }, { status: 404 })
    }

    await playerRef.update({
      uid,
      inviteTokenUsed: true,
      accountStatus: 'active',
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[invite PATCH]', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

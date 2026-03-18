/**
 * POST /api/auth/set-claims
 * Sets Custom Claims { role: 'player', clubId, playerId } and writes the
 * playerUids/{uid} → { playerId } mapping needed by Firestore Security Rules.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { CLUB_ID } from '@/lib/config'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const { idToken, playerId } = await request.json()
    if (!idToken || !playerId) {
      return NextResponse.json({ error: 'idToken und playerId benötigt' }, { status: 400 })
    }

    const decoded = await adminAuth.verifyIdToken(idToken)

    // Cross-check UID matches player doc
    const playerRef = adminDb.collection('clubs').doc(CLUB_ID).collection('players').doc(playerId)
    const playerSnap = await playerRef.get()
    if (!playerSnap.exists) return NextResponse.json({ error: 'Spieler nicht gefunden' }, { status: 404 })

    const playerData = playerSnap.data()!
    if (playerData.uid !== decoded.uid) {
      return NextResponse.json({ error: 'UID stimmt nicht überein' }, { status: 403 })
    }

    // Set Custom Claims
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: 'player',
      clubId: CLUB_ID,
      playerId,
    })

    // Write playerUids mapping – required for Security Rules (isPlayerOfClub check)
    await adminDb
      .collection('clubs').doc(CLUB_ID)
      .collection('playerUids').doc(decoded.uid)
      .set({ playerId, createdAt: FieldValue.serverTimestamp() })

    // Create session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    })

    const cookieStore = await cookies()
    cookieStore.set('__session', sessionCookie, {
      maxAge: SESSION_DURATION_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[set-claims POST]', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

/**
 * POST /api/auth/generate-invite
 *
 * Server-side invite token generation. Replaces the client-side
 * crypto.randomUUID() + sha256 approach from the player profile page.
 *
 * Body: { playerId: string }
 * Returns: { token: string, inviteUrl: string }
 *
 * Security: Only admins can generate invite tokens.
 * The plain token is returned once — only the SHA-256 hash is stored in Firestore.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { CLUB_ID, APP_URL } from '@/lib/config'
import { FieldValue } from 'firebase-admin/firestore'
import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['admin', 'secretary', 'funktionaer', 'trainer'])
const TOKEN_EXPIRY_HOURS = 72 // 3 days (more realistic than 24h for a Verein context)

async function verifyAdmin(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const uid = decoded.uid

    // Check custom claims first
    const role = decoded.role as string | undefined
    if (role && ADMIN_ROLES.has(role)) return uid

    // Fallback: check Firestore adminUsers (for manually created admins)
    const adminDoc = await adminDb
      .collection('clubs').doc(CLUB_ID)
      .collection('adminUsers').doc(uid)
      .get()
    if (adminDoc.exists) {
      const docRole = adminDoc.data()?.role as string
      if (ADMIN_ROLES.has(docRole)) {
        await adminAuth.setCustomUserClaims(uid, { role: docRole, clubId: CLUB_ID })
        return uid
      }
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

  try {
    const { playerId } = await request.json()

    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json({ error: 'playerId benötigt' }, { status: 400 })
    }

    // Verify player exists
    const playerRef = adminDb
      .collection('clubs')
      .doc(CLUB_ID)
      .collection('players')
      .doc(playerId)

    const playerSnap = await playerRef.get()
    if (!playerSnap.exists) {
      return NextResponse.json({ error: 'Spieler nicht gefunden' }, { status: 404 })
    }

    // Check if player already has an active account
    const playerData = playerSnap.data()!
    if (playerData.accountStatus === 'active' && playerData.uid) {
      return NextResponse.json(
        { error: 'Spieler hat bereits einen aktiven Account.' },
        { status: 409 }
      )
    }

    // Generate cryptographically secure token
    const token = randomBytes(32).toString('hex')
    const hash = createHash('sha256').update(token).digest('hex')

    const expiry = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    // Store hash in Firestore (never the plain token)
    await playerRef.update({
      inviteToken: hash,
      inviteTokenExpiry: expiry,
      inviteTokenUsed: false,
      accountStatus: 'invited',
      updatedAt: FieldValue.serverTimestamp(),
    })

    const inviteUrl = `${APP_URL}/invite/${token}`

    return NextResponse.json({
      token,
      inviteUrl,
      expiresAt: expiry.toISOString(),
      playerName: `${playerData.firstName} ${playerData.lastName}`,
    })
  } catch (error) {
    console.error('[generate-invite POST]', error)
    return NextResponse.json(
      { error: 'Einladungslink konnte nicht generiert werden.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/auth/generate-invite/bulk
 *
 * Generate invite tokens for multiple players at once.
 * Body: { playerIds: string[] }
 * Returns: { results: Array<{ playerId, playerName, inviteUrl, error? }> }
 */
export async function PUT(request: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const { playerIds } = await request.json()

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ error: 'playerIds Array benötigt' }, { status: 400 })
    }

    if (playerIds.length > 50) {
      return NextResponse.json(
        { error: 'Maximal 50 Spieler gleichzeitig' },
        { status: 400 }
      )
    }

    const results: Array<{
      playerId: string
      playerName: string
      inviteUrl: string
      error?: string
    }> = []

    const expiry = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    for (const playerId of playerIds) {
      try {
        const playerRef = adminDb
          .collection('clubs')
          .doc(CLUB_ID)
          .collection('players')
          .doc(playerId)

        const playerSnap = await playerRef.get()
        if (!playerSnap.exists) {
          results.push({ playerId, playerName: '', inviteUrl: '', error: 'Nicht gefunden' })
          continue
        }

        const playerData = playerSnap.data()!

        if (playerData.accountStatus === 'active' && playerData.uid) {
          results.push({
            playerId,
            playerName: `${playerData.firstName} ${playerData.lastName}`,
            inviteUrl: '',
            error: 'Bereits registriert',
          })
          continue
        }

        const token = randomBytes(32).toString('hex')
        const hash = createHash('sha256').update(token).digest('hex')

        await playerRef.update({
          inviteToken: hash,
          inviteTokenExpiry: expiry,
          inviteTokenUsed: false,
          accountStatus: 'invited',
          updatedAt: FieldValue.serverTimestamp(),
        })

        results.push({
          playerId,
          playerName: `${playerData.firstName} ${playerData.lastName}`,
          inviteUrl: `${APP_URL}/invite/${token}`,
        })
      } catch {
        results.push({ playerId, playerName: '', inviteUrl: '', error: 'Fehler' })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[generate-invite/bulk PUT]', error)
    return NextResponse.json({ error: 'Bulk-Einladung fehlgeschlagen.' }, { status: 500 })
  }
}
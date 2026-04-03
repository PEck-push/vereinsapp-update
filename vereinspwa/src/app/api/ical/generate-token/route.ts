/**
 * POST /api/ical/generate-token
 *
 * Generates a new iCal token for the club. Stored in clubs/{clubId}.settings.icalToken.
 * Only accessible by admins.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const ADMIN_ROLES = new Set(['admin', 'secretary'])

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return false
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    return !!role && ADMIN_ROLES.has(role)
  } catch { return false }
}

export async function POST() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    // Generate a cryptographically secure token
    const token = randomBytes(32).toString('hex')

    // Store it in the club document
    const clubId = await getClubIdFromSession()
    if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    await adminDb.collection('clubs').doc(clubId).set(
      { settings: { icalToken: token } },
      { merge: true }
    )

    return NextResponse.json({ token })
  } catch (error) {
    console.error('[ical/generate-token]', error)
    return NextResponse.json({ error: 'Token konnte nicht generiert werden.' }, { status: 500 })
  }
}
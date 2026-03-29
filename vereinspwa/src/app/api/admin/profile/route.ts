/**
 * PATCH /api/admin/profile
 *
 * Sets the display name on the currently logged-in admin's
 * Firebase Auth account.
 *
 * Body: { displayName: "Max Obmann" }
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { CLUB_ID } from '@/lib/config'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies()
  const session = cookieStore.get('__session')?.value
  if (!session) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const { displayName } = await request.json()

    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json({ error: 'displayName benötigt' }, { status: 400 })
    }

    // Update Firebase Auth display name
    await adminAuth.updateUser(decoded.uid, { displayName: displayName.trim() })

    return NextResponse.json({ status: 'ok', displayName: displayName.trim() })
  } catch (error) {
    console.error('[admin/profile PATCH]', error)
    return NextResponse.json({ error: 'Fehlgeschlagen' }, { status: 500 })
  }
}
/**
 * /api/admin/users
 *
 * GET    → list all admin users for this club
 * POST   → create a new admin user (Firebase Auth + Firestore)
 * DELETE  → remove an admin user (keeps Auth account, removes admin role)
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const MANAGE_ROLES = new Set(['admin']) // Only admins can manage other admins

async function verifyAdmin(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    return role && MANAGE_ROLES.has(role) ? decoded.uid : null
  } catch { return null }
}

// GET — List all admin users
export async function GET() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const snap = await adminDb
      .collection('clubs').doc(clubId)
      .collection('adminUsers')
      .orderBy('createdAt', 'desc')
      .get()

    const users = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data()
      let email = ''
      let displayName = ''
      try {
        const authUser = await adminAuth.getUser(doc.id)
        email = authUser.email ?? ''
        displayName = authUser.displayName ?? ''
      } catch { /* user might have been deleted from Auth */ }

      return {
        uid: doc.id,
        email,
        displayName,
        role: data.role ?? 'admin',
        teamIds: data.teamIds ?? [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      }
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('[admin/users GET]', error)
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

// POST — Create new admin user
export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const { email, password, displayName, role, teamIds } = await request.json()

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'email, password und role benötigt' }, { status: 400 })
    }

    const validRoles = ['admin', 'funktionaer', 'trainer', 'secretary']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Ungültige Rolle. Erlaubt: ${validRoles.join(', ')}` }, { status: 400 })
    }

    // Trainer must have teamIds
    if (role === 'trainer' && (!teamIds || teamIds.length === 0)) {
      return NextResponse.json({ error: 'Trainer benötigt mindestens ein Team' }, { status: 400 })
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    })

    // Set custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role,
      clubId,
    })

    // Create adminUsers document
    await adminDb
      .collection('clubs').doc(clubId)
      .collection('adminUsers').doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        role,
        teamIds: teamIds ?? [],
        createdAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      role,
    })
  } catch (error: unknown) {
    console.error('[admin/users POST]', error)
    const code = (error as { code?: string })?.code
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Diese E-Mail wird bereits verwendet.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Benutzer konnte nicht erstellt werden.' }, { status: 500 })
  }
}

// DELETE — Remove admin role (keeps Firebase Auth account)
export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const { uid } = await request.json()
    if (!uid) {
      return NextResponse.json({ error: 'uid benötigt' }, { status: 400 })
    }

    // Remove custom claims
    await adminAuth.setCustomUserClaims(uid, {})

    // Delete adminUsers document
    await adminDb
      .collection('clubs').doc(clubId)
      .collection('adminUsers').doc(uid)
      .delete()

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[admin/users DELETE]', error)
    return NextResponse.json({ error: 'Benutzer konnte nicht entfernt werden.' }, { status: 500 })
  }
}

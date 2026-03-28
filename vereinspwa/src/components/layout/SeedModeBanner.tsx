/**
 * DELETE /api/admin/seed-reset
 *
 * Deletes all Firestore documents where _seed === true.
 * Also removes seed auth accounts.
 * Only accessible by admins.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { CLUB_ID } from '@/lib/config'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['admin'])

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

const SEED_AUTH_EMAILS = [
  'admin@testverein.at',
  'trainer1@testverein.at',
  'trainer2@testverein.at',
]

export async function DELETE() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const clubRef = adminDb.collection('clubs').doc(CLUB_ID)
    const subcollections = ['players', 'teams', 'events', 'adminUsers', 'playerUids', 'matchStats', 'messages']
    let totalDeleted = 0

    for (const sub of subcollections) {
      const snap = await clubRef.collection(sub).where('_seed', '==', true).get()

      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = adminDb.batch()
        const chunk = snap.docs.slice(i, i + 400)

        for (const doc of chunk) {
          // Delete nested responses subcollection for events
          if (sub === 'events') {
            const respSnap = await doc.ref.collection('responses').get()
            respSnap.docs.forEach(r => batch.delete(r.ref))
            totalDeleted += respSnap.docs.length
          }
          batch.delete(doc.ref)
        }

        await batch.commit()
      }

      totalDeleted += snap.docs.length
    }

    // Remove _seedMode flag from club doc
    const clubSnap = await clubRef.get()
    if (clubSnap.exists) {
      if (clubSnap.data()?._seed === true) {
        // Entire club was seeded — delete it
        await clubRef.delete()
        totalDeleted++
      } else {
        // Real club with seed data mixed in — just remove the flag
        await clubRef.update({ _seedMode: FieldValue.delete() })
      }
    }

    // Delete seed auth accounts
    let authDeleted = 0
    for (const email of SEED_AUTH_EMAILS) {
      try {
        const user = await adminAuth.getUserByEmail(email)
        await adminAuth.deleteUser(user.uid)
        authDeleted++
      } catch {
        // Doesn't exist, skip
      }
    }

    return NextResponse.json({
      deleted: totalDeleted,
      authDeleted,
      message: `${totalDeleted} Testdokumente und ${authDeleted} Test-Accounts gelöscht.`,
    })
  } catch (error) {
    console.error('[seed-reset DELETE]', error)
    return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 })
  }
}
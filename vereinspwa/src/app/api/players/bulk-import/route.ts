/**
 * POST /api/players/bulk-import
 *
 * Bulk-import players from CSV data (max 50 per request).
 * Body: { players: Array<{ firstName, lastName, email, phone?, jerseyNumber?, teamIds?, position? }> }
 * Returns: { imported: number, errors: Array<{ index, reason }> }
 *
 * Security: Admin-only (session cookie verified).
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/firebase/auditLog'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['admin', 'secretary', 'funktionaer', 'trainer'])
const MAX_BATCH_SIZE = 50

async function verifyAdmin(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    if (role && ADMIN_ROLES.has(role)) return decoded.uid

    const clubId = await getClubIdFromSession()
    if (!clubId) return null
    const adminDoc = await adminDb
      .collection('clubs').doc(clubId)
      .collection('adminUsers').doc(decoded.uid)
      .get()
    if (adminDoc.exists) {
      const docRole = adminDoc.data()?.role as string
      if (ADMIN_ROLES.has(docRole)) return decoded.uid
    }
    return null
  } catch {
    return null
  }
}

interface ImportPlayer {
  firstName: string
  lastName: string
  email: string
  phone?: string
  jerseyNumber?: number
  teamIds?: string[]
  position?: string
}

export async function POST(request: NextRequest) {
  const adminUid = await verifyAdmin()
  if (!adminUid) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const { players } = (await request.json()) as { players: ImportPlayer[] }

    if (!Array.isArray(players) || players.length === 0) {
      return NextResponse.json({ error: 'players Array benötigt' }, { status: 400 })
    }

    if (players.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximal ${MAX_BATCH_SIZE} Spieler pro Request` },
        { status: 400 }
      )
    }

    // Load existing emails for duplicate check
    const existingSnap = await adminDb
      .collection('clubs').doc(clubId)
      .collection('players')
      .select('email')
      .get()

    const existingEmails = new Set(
      existingSnap.docs.map(d => (d.data().email as string)?.toLowerCase()).filter(Boolean)
    )

    const playersRef = adminDb.collection('clubs').doc(clubId).collection('players')
    const errors: Array<{ index: number; reason: string }> = []
    let imported = 0

    const batch = adminDb.batch()

    for (let i = 0; i < players.length; i++) {
      const p = players[i]

      // Validate required fields
      if (!p.firstName?.trim() || !p.lastName?.trim() || !p.email?.trim()) {
        errors.push({ index: i, reason: 'Pflichtfelder fehlen (Vorname, Nachname, E-Mail)' })
        continue
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
        errors.push({ index: i, reason: 'Ungültige E-Mail-Adresse' })
        continue
      }

      // Check duplicate
      if (existingEmails.has(p.email.toLowerCase())) {
        errors.push({ index: i, reason: `Duplikat E-Mail: ${p.email}` })
        continue
      }

      // Add to batch
      const newRef = playersRef.doc()
      const playerDoc: Record<string, unknown> = {
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        email: p.email.trim().toLowerCase(),
        clubId,
        teamIds: p.teamIds ?? [],
        status: 'active',
        inviteTokenUsed: false,
        accountStatus: 'invited',
        fcmTokens: [],
        notificationPrefs: { push: true, email: true },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (p.phone?.trim()) playerDoc.phone = p.phone.trim()
      if (p.jerseyNumber) playerDoc.jerseyNumber = p.jerseyNumber
      if (p.position) playerDoc.position = p.position

      batch.set(newRef, playerDoc)
      existingEmails.add(p.email.toLowerCase()) // Prevent in-batch duplicates
      imported++
    }

    if (imported > 0) {
      await batch.commit()
      writeAuditLog(clubId, {
        action: 'player.bulk_import',
        performedBy: adminUid,
        targetType: 'bulk',
        details: `${imported} Spieler importiert, ${errors.length} Fehler`,
      })
    }

    return NextResponse.json({ imported, errors })
  } catch (error) {
    console.error('[bulk-import POST]', error)
    return NextResponse.json(
      { error: 'Import fehlgeschlagen' },
      { status: 500 }
    )
  }
}

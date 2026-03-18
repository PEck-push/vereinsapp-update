import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getMessaging } from 'firebase-admin/messaging'
import { getApp } from 'firebase-admin/app'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = new Set(['admin', 'trainer', 'secretary'])

async function verifyAdminSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    return role && ADMIN_ROLES.has(role) ? decoded.uid : null
  } catch { return null }
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSession()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  try {
    const { playerIds, title, body, clubId } = await request.json()
    if (!playerIds?.length || !title || !body || !clubId) {
      return NextResponse.json({ error: 'playerIds, title, body, clubId benötigt' }, { status: 400 })
    }

    const tokensByPlayer: Record<string, string[]> = {}
    const allTokens: string[] = []

    await Promise.all((playerIds as string[]).map(async (playerId) => {
      const snap = await adminDb.collection('clubs').doc(clubId).collection('players').doc(playerId).get()
      if (!snap.exists) return
      const tokens: string[] = snap.data()?.fcmTokens ?? []
      if (tokens.length > 0) { tokensByPlayer[playerId] = tokens; allTokens.push(...tokens) }
    }))

    if (allTokens.length === 0) return NextResponse.json({ sent: 0, failed: 0 })

    const messaging = getMessaging(getApp('admin'))
    const response = await messaging.sendEachForMulticast({
      tokens: allTokens,
      notification: { title, body },
      webpush: {
        notification: { title, body, icon: '/icon-192.png' },
        fcmOptions: { link: '/mein-bereich' },
      },
    })

    // Remove invalid tokens from Firestore
    const invalidTokens = new Set<string>()
    response.responses.forEach((resp, idx) => {
      const code = resp.error?.code
      if (!resp.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
        invalidTokens.add(allTokens[idx])
      }
    })

    if (invalidTokens.size > 0) {
      const batch = adminDb.batch()
      for (const [playerId, tokens] of Object.entries(tokensByPlayer)) {
        const stale = tokens.filter((t) => invalidTokens.has(t))
        if (stale.length) {
          const ref = adminDb.collection('clubs').doc(clubId).collection('players').doc(playerId)
          batch.update(ref, { fcmTokens: FieldValue.arrayRemove(...stale) })
        }
      }
      await batch.commit()
    }

    return NextResponse.json({ sent: response.successCount, failed: response.failureCount, invalidRemoved: invalidTokens.size })
  } catch (error) {
    console.error('[notifications/send]', error)
    return NextResponse.json({ error: 'Versand fehlgeschlagen' }, { status: 500 })
  }
}

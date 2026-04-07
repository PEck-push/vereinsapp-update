/**
 * POST /api/telegram/weekly-digest
 *
 * Triggers the weekly Telegram digest manually or via external cron.
 * Posts event summaries with response buttons to all linked team groups.
 *
 * Auth: Requires CRON_SECRET header or admin session.
 *
 * Setup: Use a free cron service (e.g. cron-job.org) to call this
 * endpoint every Monday at 08:00 with the Authorization header.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyDigest } from '@/telegram/weeklyPost'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const ADMIN_ROLES = new Set(['admin', 'secretary'])

async function verifyAccess(request: NextRequest): Promise<boolean> {
  // Option 1: CRON_SECRET header (for external cron services)
  const authHeader = request.headers.get('authorization') ?? ''
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
    return true
  }

  // Option 2: Admin session cookie
  const cookieStore = await cookies()
  const session = cookieStore.get('__session')?.value
  if (!session) return false
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    if (decoded.role && ADMIN_ROLES.has(decoded.role as string)) return true
    const cId = await getClubIdFromSession()
    if (!cId) return false
    const adminDoc = await adminDb.collection('clubs').doc(cId).collection('adminUsers').doc(decoded.uid).get()
    return adminDoc.exists && ADMIN_ROLES.has(adminDoc.data()?.role)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!await verifyAccess(request)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN nicht konfiguriert' }, { status: 500 })
  }

  try {
    await runWeeklyDigest()
    return NextResponse.json({ ok: true, message: 'Wochenvorschau gesendet' })
  } catch (error) {
    console.error('[telegram/weekly-digest]', error)
    return NextResponse.json({ error: 'Digest fehlgeschlagen' }, { status: 500 })
  }
}

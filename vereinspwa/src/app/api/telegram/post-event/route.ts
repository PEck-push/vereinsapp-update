/**
 * POST /api/telegram/post-event
 *
 * Posts a single event to selected Telegram groups.
 *
 * Body: { eventId: string, groupIds: number[] }
 * Returns: { results: Array<{ teamName, success, error? }> }
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { Timestamp } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const ADMIN_ROLES = new Set(['admin', 'secretary', 'trainer', 'funktionaer'])

async function verifyAdmin(): Promise<boolean> {
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
  } catch { return false }
}

async function telegramSend(chatId: number, text: string, inlineKeyboard?: { text: string; callback_data?: string }[][]) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json()
  return data.ok ? data.result : null
}

const TYPE_LABELS: Record<string, string> = {
  training: 'Training', match: 'Spiel', meeting: 'Besprechung', event: 'Vereins-Event', other: 'Termin',
}
const DECLINE_LABELS: Record<string, string> = { injury: 'Verletzt', work: 'Arbeit', private: 'Privat' }

export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN nicht konfiguriert' }, { status: 500 })
  }

  try {
    const { eventId, groupIds } = await request.json()

    if (!eventId || !Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: 'eventId und groupIds[] benötigt' }, { status: 400 })
    }

    const clubId = await getClubIdFromSession()
    if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    // Load event
    const eventSnap = await adminDb.collection('clubs').doc(clubId).collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event nicht gefunden' }, { status: 404 })
    }
    const ev = eventSnap.data()!
    const startDate = (ev.startDate as Timestamp).toDate()

    // Load responses
    const respSnap = await adminDb.collection('clubs').doc(clubId).collection('events').doc(eventId).collection('responses').get()

    // Load player names for responses
    const playerIds = respSnap.docs.map(d => d.id)
    const names: Record<string, string> = {}
    for (let i = 0; i < playerIds.length; i += 30) {
      const batch = playerIds.slice(i, i + 30)
      if (!batch.length) continue
      const { FieldPath } = await import('firebase-admin/firestore')
      const ps = await adminDb.collection('clubs').doc(clubId).collection('players')
        .where(FieldPath.documentId(), 'in', batch).get()
      ps.docs.forEach(d => { names[d.id] = `${d.data().firstName} ${d.data().lastName?.[0] ?? ''}.` })
    }

    const accepted = respSnap.docs
      .filter(d => d.data().status === 'accepted')
      .map(d => names[d.id] ?? d.id)
    const declined = respSnap.docs
      .filter(d => d.data().status === 'declined')
      .map(d => {
        const cat = d.data().declineCategory
        return `${names[d.id] ?? d.id}${cat ? ` (${DECLINE_LABELS[cat] ?? cat})` : ''}`
      })

    // Format message
    const dateStr = startDate.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' })
    const timeStr = startDate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })

    const text = [
      `<b>${TYPE_LABELS[ev.type] ?? 'Termin'}: ${ev.title}</b>`,
      `${dateStr} | ${timeStr} Uhr`,
      ev.location ? `Ort: ${ev.location}` : '',
      '',
      `<b>Zugesagt (${accepted.length}):</b> ${accepted.length > 0 ? accepted.join(', ') : '—'}`,
      `<b>Abgesagt (${declined.length}):</b> ${declined.length > 0 ? declined.join(', ') : '—'}`,
    ].filter(Boolean).join('\n')

    const buttons = [[
      { text: '✅ Zusagen', callback_data: `r:${eventId}:a` },
      { text: '❌ Absagen', callback_data: `r:${eventId}:d` },
    ]]

    // Load team names for group mapping
    const teamsSnap = await adminDb.collection('clubs').doc(clubId).collection('teams').get()
    const teamsByGroupId: Record<number, string> = {}
    teamsSnap.docs.forEach(d => {
      const gId = d.data().telegramGroupId
      if (gId) teamsByGroupId[gId] = d.data().name
    })

    // Post to each selected group
    const results: { teamName: string; success: boolean; error?: string }[] = []

    for (const groupId of groupIds) {
      const teamName = teamsByGroupId[groupId] ?? `Gruppe ${groupId}`
      try {
        const sent = await telegramSend(groupId, text, buttons)
        if (sent) {
          // Save message reference for live-updates
          await eventSnap.ref.update({
            [`telegramMessages.${groupId}`]: { messageId: sent.message_id, chatId: groupId },
          })
          results.push({ teamName, success: true })
        } else {
          results.push({ teamName, success: false, error: 'Senden fehlgeschlagen' })
        }
      } catch (err) {
        results.push({ teamName, success: false, error: (err as Error).message })
      }
      await new Promise(r => setTimeout(r, 300)) // Rate limit
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[telegram/post-event]', error)
    return NextResponse.json({ error: 'Posting fehlgeschlagen' }, { status: 500 })
  }
}
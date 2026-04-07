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
import { FieldPath, Timestamp } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { formatEventMessage, buildEventButtons } from '@/telegram/formatting'

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
    const endDate = ev.endDate ? (ev.endDate as Timestamp).toDate() : undefined

    // Load responses
    const respSnap = await adminDb.collection('clubs').doc(clubId).collection('events').doc(eventId).collection('responses').get()

    // Load player names for responses
    const playerIds = respSnap.docs.map(d => d.id)
    const names: Record<string, string> = {}
    for (let i = 0; i < playerIds.length; i += 30) {
      const batch = playerIds.slice(i, i + 30)
      if (!batch.length) continue
      const ps = await adminDb.collection('clubs').doc(clubId).collection('players')
        .where(FieldPath.documentId(), 'in', batch).get()
      ps.docs.forEach(d => { names[d.id] = `${d.data().firstName} ${d.data().lastName?.[0] ?? ''}.` })
    }

    // Build response summary
    const accepted = respSnap.docs
      .filter(d => d.data().status === 'accepted')
      .map(d => ({ name: names[d.id] ?? d.id }))
    const declined = respSnap.docs
      .filter(d => d.data().status === 'declined')
      .map(d => ({
        name: names[d.id] ?? d.id,
        category: d.data().declineCategory as string | undefined,
      }))

    // Load team names for group mapping + pending count
    const teamsSnap = await adminDb.collection('clubs').doc(clubId).collection('teams').get()
    const teamsByGroupId: Record<number, { name: string; id: string }> = {}
    teamsSnap.docs.forEach(d => {
      const gId = d.data().telegramGroupId
      if (gId) teamsByGroupId[gId] = { name: d.data().name, id: d.id }
    })

    // Count eligible players for pending count
    const eventTeamIds = ev.teamIds as string[] ?? []
    let totalPlayers = 0
    if (eventTeamIds.length > 0) {
      for (let i = 0; i < eventTeamIds.length; i += 10) {
        const batch = eventTeamIds.slice(i, i + 10)
        const pSnap = await adminDb.collection('clubs').doc(clubId).collection('players')
          .where('teamIds', 'array-contains-any', batch)
          .where('status', 'in', ['active', 'injured'])
          .get()
        const ids = new Set<string>()
        pSnap.docs.forEach(d => ids.add(d.id))
        totalPlayers = ids.size
      }
    }
    const pendingCount = Math.max(0, totalPlayers - accepted.length - declined.length)

    // Find team name for the event
    let teamName: string | undefined
    if (eventTeamIds.length > 0) {
      const teamDoc = teamsSnap.docs.find(d => d.id === eventTeamIds[0])
      teamName = teamDoc?.data()?.name
    }

    // Format message using shared formatting (with HTML escaping)
    const text = formatEventMessage(
      { id: eventId, title: ev.title, type: ev.type, startDate, endDate, location: ev.location },
      { accepted, declined, pendingCount },
      teamName
    )
    const buttons = buildEventButtons(eventId)

    // Post to each selected group
    const results: { teamName: string; success: boolean; error?: string }[] = []

    for (const groupId of groupIds) {
      const groupTeam = teamsByGroupId[groupId]?.name ?? `Gruppe ${groupId}`
      try {
        const sent = await telegramSend(groupId, text, buttons)
        if (sent) {
          await eventSnap.ref.update({
            [`telegramMessages.${groupId}`]: { messageId: sent.message_id, chatId: groupId },
          })
          results.push({ teamName: groupTeam, success: true })
        } else {
          results.push({ teamName: groupTeam, success: false, error: 'Senden fehlgeschlagen' })
        }
      } catch (err) {
        results.push({ teamName: groupTeam, success: false, error: (err as Error).message })
      }
      await new Promise(r => setTimeout(r, 300)) // Rate limit
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[telegram/post-event]', error)
    return NextResponse.json({ error: 'Posting fehlgeschlagen' }, { status: 500 })
  }
}

/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot webhook endpoint as Next.js API route.
 * This replaces the Firebase Cloud Function version
 * so it works on Netlify without CLI deployment.
 *
 * After deploying, register with Telegram:
 * Open this URL in your browser (replace TOKEN):
 * https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP.netlify.app/api/telegram/webhook
 */
import { NextRequest, NextResponse } from 'next/server'

// Dynamic import to avoid build errors when telegram modules don't exist yet
async function getWebhookHandler() {
  try {
    // Initialize Firebase Admin if not already done
    const admin = await import('firebase-admin')
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        }, 'telegram')
      }
    }
    return null // Placeholder until telegram modules are integrated
  } catch {
    return null
  }
}

// ─── Inline Telegram Bot Logic ────────────────────────────────────────────────
// (Self-contained so it works without the functions/src/telegram/ modules)

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? ''
const BOT_USERNAME = () => process.env.TELEGRAM_BOT_USERNAME ?? ''
const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? 'default-club'

async function telegramApi(method: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch (err) {
    console.error(`[Telegram] ${method}:`, err)
    return null
  }
}

async function sendMessage(chatId: number, text: string, options?: {
  inlineKeyboard?: { text: string; callback_data?: string; url?: string }[][]
  replyKeyboard?: { text: string; request_contact?: boolean }[][]
  removeKeyboard?: boolean
}) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (options?.inlineKeyboard) body.reply_markup = { inline_keyboard: options.inlineKeyboard }
  else if (options?.replyKeyboard) body.reply_markup = { keyboard: options.replyKeyboard, one_time_keyboard: true, resize_keyboard: true }
  else if (options?.removeKeyboard) body.reply_markup = { remove_keyboard: true }
  return telegramApi('sendMessage', body)
}

async function editMessageText(chatId: number, messageId: number, text: string, inlineKeyboard?: { text: string; callback_data?: string }[][]) {
  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard }
  return telegramApi('editMessageText', body)
}

async function answerCallbackQuery(id: string, text?: string) {
  return telegramApi('answerCallbackQuery', { callback_query_id: id, text: text ?? '' })
}

// ─── Phone Matching ───────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1)
  else if (cleaned.startsWith('00')) cleaned = cleaned.substring(2)
  else if (cleaned.startsWith('0')) cleaned = '43' + cleaned.substring(1)
  return cleaned
}

async function getFirestore() {
  const admin = await import('firebase-admin')
  const app = admin.apps.find(a => a?.name === 'telegram') ?? admin.apps[0]
  if (!app) throw new Error('No Firebase app')
  return admin.firestore(app)
}

async function findPlayerByPhone(phone: string) {
  const db = await getFirestore()
  const normalized = normalizePhone(phone)
  if (normalized.length < 8) return null
  const snap = await db.collection('clubs').doc(CLUB_ID).collection('players').get()
  for (const doc of snap.docs) {
    const stored = doc.data().phone as string | undefined
    if (stored && normalizePhone(stored) === normalized) {
      return { playerId: doc.id, name: `${doc.data().firstName} ${doc.data().lastName}` }
    }
  }
  return null
}

async function findPlayerByTelegramId(telegramUserId: number) {
  const db = await getFirestore()
  const snap = await db.collection('clubs').doc(CLUB_ID).collection('players')
    .where('telegramUserId', '==', telegramUserId).limit(1).get()
  if (snap.empty) return null
  const d = snap.docs[0]
  return { playerId: d.id, name: `${d.data().firstName} ${d.data().lastName}` }
}

// ─── Response Logic ───────────────────────────────────────────────────────────

async function writeResponse(eventId: string, playerId: string, status: 'accepted' | 'declined', declineCategory?: string) {
  const admin = await import('firebase-admin')
  const db = await getFirestore()
  const respRef = db.collection('clubs').doc(CLUB_ID).collection('events').doc(eventId).collection('responses').doc(playerId)
  const eventRef = db.collection('clubs').doc(CLUB_ID).collection('events').doc(eventId)

  const existing = await respRef.get()
  const prevStatus = existing.exists ? existing.data()?.status : null

  const data: Record<string, unknown> = {
    playerId, status,
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'telegram',
  }
  if (declineCategory) data.declineCategory = declineCategory
  await respRef.set(data, { merge: true })

  if (!prevStatus) {
    await eventRef.update({
      [`responseCount.${status}`]: admin.firestore.FieldValue.increment(1),
      'responseCount.total': admin.firestore.FieldValue.increment(1),
    })
  } else if (prevStatus !== status) {
    await eventRef.update({
      [`responseCount.${prevStatus}`]: admin.firestore.FieldValue.increment(-1),
      [`responseCount.${status}`]: admin.firestore.FieldValue.increment(1),
    })
  }
}

function buildEventButtons(eventId: string) {
  return [[
    { text: '✅ Zusagen', callback_data: `r:${eventId}:a` },
    { text: '❌ Absagen', callback_data: `r:${eventId}:d` },
  ]]
}

function buildDeclineButtons(eventId: string) {
  return [
    [{ text: '🤕 Verletzung', callback_data: `c:${eventId}:injury` }, { text: '💼 Arbeit', callback_data: `c:${eventId}:work` }],
    [{ text: '🏠 Privat', callback_data: `c:${eventId}:private` }, { text: '↩️ Zurück', callback_data: `r:${eventId}:back` }],
  ]
}

async function refreshEventMessage(eventId: string, chatId: number, messageId: number) {
  const admin = await import('firebase-admin')
  const db = await getFirestore()
  const eventSnap = await db.collection('clubs').doc(CLUB_ID).collection('events').doc(eventId).get()
  if (!eventSnap.exists) return
  const event = eventSnap.data()!
  const startDate = (event.startDate as admin.firestore.Timestamp).toDate()

  const responsesSnap = await db.collection('clubs').doc(CLUB_ID).collection('events').doc(eventId).collection('responses').get()

  // Load player names
  const pIds = responsesSnap.docs.map(d => d.id)
  const names: Record<string, string> = {}
  for (let i = 0; i < pIds.length; i += 30) {
    const batch = pIds.slice(i, i + 30)
    if (!batch.length) continue
    const ps = await db.collection('clubs').doc(CLUB_ID).collection('players').where(admin.firestore.FieldPath.documentId(), 'in', batch).get()
    ps.docs.forEach(d => { names[d.id] = `${d.data().firstName} ${d.data().lastName?.[0] ?? ''}.` })
  }

  const DECLINE_LABELS: Record<string, string> = { injury: 'Verletzt', work: 'Arbeit', private: 'Privat' }
  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Besprechung', event: 'Vereins-Event', other: 'Termin' }

  const accepted = responsesSnap.docs.filter(d => d.data().status === 'accepted').map(d => names[d.id] ?? d.id)
  const declined = responsesSnap.docs.filter(d => d.data().status === 'declined').map(d => {
    const cat = d.data().declineCategory
    return `${names[d.id] ?? d.id}${cat ? ` (${DECLINE_LABELS[cat] ?? cat})` : ''}`
  })

  const dateStr = startDate.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' })
  const timeStr = startDate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })

  const lines = [
    `<b>${TYPE_LABELS[event.type] ?? 'Termin'}: ${event.title}</b>`,
    `${dateStr} | ${timeStr} Uhr`,
    event.location ? `Ort: ${event.location}` : '',
    '',
    `<b>Zugesagt (${accepted.length}):</b> ${accepted.length > 0 ? accepted.join(', ') : '—'}`,
    `<b>Abgesagt (${declined.length}):</b> ${declined.length > 0 ? declined.join(', ') : '—'}`,
  ].filter(Boolean).join('\n')

  await editMessageText(chatId, messageId, lines, buildEventButtons(eventId))
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })
  }

  try {
    const update = await request.json()

    // ── Callback Query (button press) ──
    if (update.callback_query) {
      const cb = update.callback_query
      const data = cb.data ?? ''

      // Response: r:EVENT_ID:a/d/back
      if (data.startsWith('r:')) {
        const [, eventId, action] = data.split(':')
        const player = await findPlayerByTelegramId(cb.from.id)

        if (!player) {
          await answerCallbackQuery(cb.id, '❌ Nicht verknüpft. Schreib dem Bot eine DM.')
          return NextResponse.json({ ok: true })
        }

        if (action === 'a') {
          await writeResponse(eventId, player.playerId, 'accepted')
          await answerCallbackQuery(cb.id, `✅ ${player.name} — Zugesagt!`)
          if (cb.message) await refreshEventMessage(eventId, cb.message.chat.id, cb.message.message_id)
        } else if (action === 'd') {
          await answerCallbackQuery(cb.id)
          if (cb.message) {
            await editMessageText(cb.message.chat.id, cb.message.message_id,
              `${cb.message.text ?? ''}\n\n<b>${player.name}</b>, warum kannst du nicht?`,
              buildDeclineButtons(eventId))
          }
        } else if (action === 'back') {
          await answerCallbackQuery(cb.id)
          if (cb.message) await refreshEventMessage(eventId, cb.message.chat.id, cb.message.message_id)
        }
      }

      // Decline category: c:EVENT_ID:injury/work/private
      if (data.startsWith('c:')) {
        const [, eventId, category] = data.split(':')
        const player = await findPlayerByTelegramId(cb.from.id)
        if (!player) { await answerCallbackQuery(cb.id, '❌ Nicht verknüpft.'); return NextResponse.json({ ok: true }) }
        await writeResponse(eventId, player.playerId, 'declined', category)
        await answerCallbackQuery(cb.id, `❌ ${player.name} — Abgesagt`)
        if (cb.message) await refreshEventMessage(eventId, cb.message.chat.id, cb.message.message_id)
      }

      return NextResponse.json({ ok: true })
    }

    // ── Messages ──
    if (update.message) {
      const msg = update.message
      const chatId = msg.chat.id
      const text = (msg.text ?? '').trim()
      const isGroup = msg.chat.type !== 'private'

      // Contact shared (phone linking)
      if (msg.contact) {
        const contact = msg.contact
        if (contact.user_id && contact.user_id !== msg.from?.id) {
          await sendMessage(chatId, '⚠️ Du kannst nur deine eigene Nummer teilen.', { removeKeyboard: true })
          return NextResponse.json({ ok: true })
        }

        const existing = await findPlayerByTelegramId(msg.from.id)
        if (existing) {
          await sendMessage(chatId, `Du bist bereits als <b>${existing.name}</b> verknüpft. ✅`, { removeKeyboard: true })
          return NextResponse.json({ ok: true })
        }

        const match = await findPlayerByPhone(contact.phone_number)
        if (!match) {
          await sendMessage(chatId, '❌ Deine Telefonnummer konnte keinem Spieler zugeordnet werden.\n\nBitte kontaktiere deinen Admin.', { removeKeyboard: true })
          return NextResponse.json({ ok: true })
        }

        const db = await getFirestore()
        await db.collection('clubs').doc(CLUB_ID).collection('players').doc(match.playerId).update({
          telegramUserId: msg.from.id,
          ...(msg.from.username && { telegramUsername: msg.from.username }),
        })
        await sendMessage(chatId, `✅ Verknüpft! Du bist als <b>${match.name}</b> registriert.`, { removeKeyboard: true })
        return NextResponse.json({ ok: true })
      }

      // /setup TEAMNAME (in group)
      if (text.startsWith('/setup')) {
        const teamName = text.replace(/^\/setup\s*/i, '').trim()
        if (!isGroup) { await sendMessage(chatId, '⚠️ /setup nur in Gruppen-Chats.'); return NextResponse.json({ ok: true }) }
        if (!teamName) { await sendMessage(chatId, '⚠️ Team-Name angeben: <code>/setup Herren 1</code>'); return NextResponse.json({ ok: true }) }

        const db = await getFirestore()
        const allTeams = await db.collection('clubs').doc(CLUB_ID).collection('teams').get()
        const match = allTeams.docs.find(d => d.data().name.toLowerCase() === teamName.toLowerCase())

        if (!match) {
          const list = allTeams.docs.map(d => `• ${d.data().name}`).join('\n')
          await sendMessage(chatId, `❌ Team "${teamName}" nicht gefunden.\n\nVerfügbare Teams:\n${list || '(keine)'}`)
          return NextResponse.json({ ok: true })
        }

        await match.ref.update({ telegramGroupId: chatId })
        const deepLink = `https://t.me/${BOT_USERNAME()}?start=link_${match.id}`
        await sendMessage(chatId,
          `✅ <b>Gruppe verknüpft mit ${match.data().name}</b>\n\nSpieler können sich jetzt verknüpfen:`,
          { inlineKeyboard: [[{ text: '🔗 Jetzt verknüpfen', url: deepLink }]] })
        return NextResponse.json({ ok: true })
      }

      // /start (in DM)
      if (text.startsWith('/start')) {
        if (isGroup) return NextResponse.json({ ok: true })
        const existing = await findPlayerByTelegramId(msg.from?.id)
        if (existing) { await sendMessage(chatId, `Du bist bereits als <b>${existing.name}</b> verknüpft. ✅`); return NextResponse.json({ ok: true }) }
        await sendMessage(chatId,
          '👋 <b>Willkommen beim Vereinsmanager-Bot!</b>\n\nTeile deine Telefonnummer um dich zu verknüpfen:',
          { replyKeyboard: [[{ text: '📱 Telefonnummer teilen', request_contact: true }]] })
        return NextResponse.json({ ok: true })
      }

      // /status
      if (text === '/status') {
        if (!isGroup) {
          const player = await findPlayerByTelegramId(msg.from?.id)
          await sendMessage(chatId, player ? `✅ Du bist als <b>${player.name}</b> verknüpft.` : '❌ Nicht verknüpft. Teile deine Nummer mit /start.')
          return NextResponse.json({ ok: true })
        }
        const db = await getFirestore()
        const teams = await db.collection('clubs').doc(CLUB_ID).collection('teams').where('telegramGroupId', '==', chatId).limit(1).get()
        if (teams.empty) { await sendMessage(chatId, '❌ Gruppe nicht verknüpft. Verwende /setup'); return NextResponse.json({ ok: true }) }
        const teamId = teams.docs[0].id
        const teamName = teams.docs[0].data().name
        const players = await db.collection('clubs').doc(CLUB_ID).collection('players').where('teamIds', 'array-contains', teamId).get()
        const total = players.docs.length
        const linked = players.docs.filter(d => d.data().telegramUserId).length
        await sendMessage(chatId, `<b>Status — ${teamName}</b>\n\nSpieler: ${total}\nVerknüpft: ${linked}\nNicht verknüpft: ${total - linked}`)
        return NextResponse.json({ ok: true })
      }

      // /help
      if (text === '/help') {
        await sendMessage(chatId, isGroup
          ? '<b>Befehle:</b>\n/setup Teamname — Gruppe verknüpfen\n/status — Status anzeigen\n/help — Diese Hilfe'
          : '<b>Befehle:</b>\n/start — Verknüpfung starten\n/status — Status anzeigen\n/help — Diese Hilfe')
        return NextResponse.json({ ok: true })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telegram/webhook]', err)
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }
}
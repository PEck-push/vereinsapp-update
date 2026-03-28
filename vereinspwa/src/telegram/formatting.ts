/**
 * Message formatting for Telegram event posts.
 * Uses HTML parse mode for bold/italic.
 */

import type { InlineKeyboardButton } from './api'

const TYPE_EMOJI: Record<string, string> = {
  training: '🏃',
  match: '⚽',
  meeting: '📋',
  event: '🎉',
  other: '📅',
}

const TYPE_LABEL: Record<string, string> = {
  training: 'Training',
  match: 'Spiel',
  meeting: 'Besprechung',
  event: 'Vereins-Event',
  other: 'Termin',
}

const DECLINE_LABELS: Record<string, string> = {
  injury: 'Verletzt',
  work: 'Arbeit',
  private: 'Privat',
}

interface EventData {
  id: string
  title: string
  type: string
  startDate: Date
  endDate?: Date
  location?: string
}

interface ResponseSummary {
  accepted: { name: string }[]
  declined: { name: string; category?: string }[]
  pendingCount: number
}

// ─── Event Message ────────────────────────────────────────────────────────────

export function formatEventMessage(
  event: EventData,
  responses: ResponseSummary,
  teamName?: string
): string {
  const emoji = TYPE_EMOJI[event.type] ?? '📅'
  const typeLabel = TYPE_LABEL[event.type] ?? 'Termin'

  const dateStr = event.startDate.toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Vienna',
  })
  const timeStr = event.startDate.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Vienna',
  })

  let endTimeStr = ''
  if (event.endDate) {
    endTimeStr = ` – ${event.endDate.toLocaleTimeString('de-AT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Vienna',
    })}`
  }

  const lines: string[] = []

  // Header
  lines.push(`${emoji} <b>${typeLabel}: ${escapeHtml(event.title)}</b>`)
  if (teamName) {
    lines.push(`🏟 ${escapeHtml(teamName)}`)
  }
  lines.push(`📅 ${dateStr} · ${timeStr}${endTimeStr} Uhr`)

  if (event.location) {
    lines.push(`📍 ${escapeHtml(event.location)}`)
  }

  lines.push('') // Empty line before responses

  // ── Accepted ──
  const acceptedCount = responses.accepted.length
  if (acceptedCount > 0) {
    const names = responses.accepted.map(r => escapeHtml(r.name))
    if (names.length <= 8) {
      lines.push(`✅ <b>Zugesagt (${acceptedCount}):</b> ${names.join(', ')}`)
    } else {
      lines.push(`✅ <b>Zugesagt (${acceptedCount}):</b> ${names.slice(0, 6).join(', ')} +${names.length - 6}`)
    }
  } else {
    lines.push('✅ <b>Zugesagt:</b> —')
  }

  // ── Declined ──
  const declinedCount = responses.declined.length
  if (declinedCount > 0) {
    const names = responses.declined.map(r => {
      const cat = r.category ? ` (${DECLINE_LABELS[r.category] ?? r.category})` : ''
      return `${escapeHtml(r.name)}${cat}`
    })
    if (names.length <= 5) {
      lines.push(`❌ <b>Abgesagt (${declinedCount}):</b> ${names.join(', ')}`)
    } else {
      lines.push(`❌ <b>Abgesagt (${declinedCount}):</b> ${names.slice(0, 4).join(', ')} +${names.length - 4}`)
    }
  } else {
    lines.push('❌ <b>Abgesagt:</b> —')
  }

  // ── Pending ──
  if (responses.pendingCount > 0) {
    lines.push(`⏳ <b>Ausstehend:</b> ${responses.pendingCount}`)
  }

  return lines.join('\n')
}

/**
 * Build inline keyboard for an event.
 */
export function buildEventButtons(eventId: string): InlineKeyboardButton[][] {
  return [
    [
      { text: '✅ Zusagen', callback_data: `r:${eventId}:a` },
      { text: '❌ Absagen', callback_data: `r:${eventId}:d` },
    ],
  ]
}

/**
 * Build decline category selection buttons.
 */
export function buildDeclineCategoryButtons(eventId: string): InlineKeyboardButton[][] {
  return [
    [
      { text: '🤕 Verletzung', callback_data: `c:${eventId}:injury` },
      { text: '💼 Arbeit', callback_data: `c:${eventId}:work` },
    ],
    [
      { text: '🏠 Privat', callback_data: `c:${eventId}:private` },
      { text: '↩️ Zurück', callback_data: `r:${eventId}:back` },
    ],
  ]
}

// ─── Weekly Digest Header ─────────────────────────────────────────────────────

export function formatWeeklyHeader(teamName: string, eventCount: number): string {
  const now = new Date()
  const monday = new Date(now)
  const day = monday.getDay()
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))

  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)

  const fromStr = monday.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' })
  const toStr = sunday.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' })

  return [
    `📅 <b>Wochenvorschau — ${escapeHtml(teamName)}</b>`,
    `${fromStr} – ${toStr}`,
    `${eventCount} ${eventCount === 1 ? 'Termin' : 'Termine'} diese Woche`,
    '',
    '⬇️ Bitte antworte auf die Termine unten:',
  ].join('\n')
}

// ─── Onboarding Messages ──────────────────────────────────────────────────────

export function formatSetupSuccess(teamName: string, botUsername: string): string {
  return [
    `✅ <b>Gruppe verknüpft mit ${escapeHtml(teamName)}</b>`,
    '',
    'Spieler können sich jetzt verknüpfen:',
    `👉 Schreibt <b>@${botUsername}</b> eine Nachricht und teilt eure Telefonnummer.`,
    '',
    'Oder tippt auf den Button unten:',
  ].join('\n')
}

export function formatLinkSuccess(playerName: string): string {
  return `✅ Verknüpft! Du bist als <b>${escapeHtml(playerName)}</b> registriert. Ab jetzt bekommst du Termine in deiner Mannschafts-Gruppe.`
}

export function formatLinkFailed(): string {
  return [
    '❌ Deine Telefonnummer konnte keinem Spieler zugeordnet werden.',
    '',
    'Mögliche Gründe:',
    '• Deine Nummer ist nicht im System hinterlegt',
    '• Die Nummer stimmt nicht überein',
    '',
    'Bitte kontaktiere deinen Admin — er kann dich manuell verknüpfen.',
  ].join('\n')
}

export function formatAlreadyLinked(playerName: string): string {
  return `Du bist bereits als <b>${escapeHtml(playerName)}</b> verknüpft. ✅`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
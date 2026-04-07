/**
 * Command handlers for the Telegram bot.
 *
 * /setup TEAMNAME — Links a Telegram group to a team (admin runs this in group)
 * /start link_TEAMID — Player opens DM to link their account (via deep link)
 * /start — Generic start, prompts to share phone
 * /status — Shows link status
 *
 * Contact message — Player shares phone number for auto-matching
 */

import { db } from './db'
import {
  sendMessage,
  type TelegramMessage,
  type InlineKeyboardButton,
  type ReplyKeyboardButton,
} from './api'
import {
  findPlayerByPhone,
  findPlayerByTelegramId,
  linkTelegramToPlayer,
} from './phoneMatch'
import {
  formatSetupSuccess,
  formatLinkSuccess,
  formatLinkFailed,
  formatAlreadyLinked,
} from './formatting'

const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? process.env.CLUB_ID ?? 'default-club'
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'VereinBot'

// ─── /setup TEAMNAME ──────────────────────────────────────────────────────────

export async function handleSetupCommand(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id
  const chatType = message.chat.type

  // Must be in a group
  if (chatType === 'private') {
    await sendMessage(chatId, '⚠️ <b>/setup</b> kann nur in einer Gruppen-Chat verwendet werden.')
    return
  }

  // Extract team name from command text
  const text = message.text ?? ''
  const teamName = text.replace(/^\/setup\s*/i, '').trim()

  if (!teamName) {
    await sendMessage(chatId, [
      '⚠️ Bitte Mannschaftsname angeben:',
      '',
      '<code>/setup Herren 1</code>',
      '<code>/setup U17</code>',
      '',
      'Der Name muss genau so geschrieben werden wie in der App.',
    ].join('\n'))
    return
  }

  // Find team by name

  const teamsSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('teams')
    .where('name', '==', teamName)
    .limit(1)
    .get()

  if (teamsSnap.empty) {
    // Try case-insensitive search
    const allTeams = await db
      .collection('clubs').doc(CLUB_ID)
      .collection('teams')
      .get()

    const match = allTeams.docs.find(
      d => d.data().name.toLowerCase() === teamName.toLowerCase()
    )

    if (!match) {
      const teamList = allTeams.docs.map(d => `• ${d.data().name}`).join('\n')
      await sendMessage(chatId, [
        `❌ Mannschaft "${teamName}" nicht gefunden.`,
        '',
        'Verfügbare Mannschaften:',
        teamList || '(keine angelegt)',
      ].join('\n'))
      return
    }

    // Found with different casing
    await linkGroupToTeam(chatId, match.id, match.data().name)
    return
  }

  const teamDoc = teamsSnap.docs[0]
  await linkGroupToTeam(chatId, teamDoc.id, teamDoc.data().name)
}

async function linkGroupToTeam(
  chatId: number,
  teamId: string,
  teamName: string
): Promise<void> {


  // Save group ID on team
  await db
    .collection('clubs').doc(CLUB_ID)
    .collection('teams').doc(teamId)
    .update({ telegramGroupId: chatId })

  // Send confirmation + onboarding prompt
  const deepLink = `https://t.me/${BOT_USERNAME}?start=link_${teamId}`

  await sendMessage(
    chatId,
    formatSetupSuccess(teamName, BOT_USERNAME),
    {
      inlineKeyboard: [
        [{ text: '🔗 Jetzt verknüpfen', url: deepLink }],
      ],
    }
  )
}

// ─── /start (DM) ──────────────────────────────────────────────────────────────

export async function handleStartCommand(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id
  const telegramUserId = message.from?.id

  if (!telegramUserId) return

  // Check if already linked
  const existing = await findPlayerByTelegramId(CLUB_ID, telegramUserId)
  if (existing) {
    await sendMessage(chatId, formatAlreadyLinked(existing.playerName))
    return
  }

  // Check for deep link parameter
  const text = message.text ?? ''
  const startParam = text.replace(/^\/start\s*/i, '').trim()

  let contextMsg = ''
  if (startParam.startsWith('link_')) {
    const teamId = startParam.replace('link_', '')
  
    const teamSnap = await db
      .collection('clubs').doc(CLUB_ID)
      .collection('teams').doc(teamId)
      .get()

    if (teamSnap.exists) {
      contextMsg = `\n\nDu verknüpfst dich mit <b>${teamSnap.data()?.name}</b>.`
    }
  }

  // Ask for phone number
  await sendMessage(
    chatId,
    [
      '👋 Willkommen beim Vereinsmanager-Bot!',
      contextMsg,
      '',
      'Um dich mit deinem Spielerprofil zu verknüpfen, teile bitte deine <b>Telefonnummer</b>.',
      '',
      'Tippe auf den Button unten — deine Nummer wird automatisch mit dem System abgeglichen.',
    ].join('\n'),
    {
      replyKeyboard: [
        [{ text: '📱 Telefonnummer teilen', request_contact: true }],
      ],
    }
  )
}

// ─── Contact (Phone Sharing) ──────────────────────────────────────────────────

export async function handleContact(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id
  const contact = message.contact
  const telegramUserId = message.from?.id

  if (!contact || !telegramUserId) return

  // Security: only accept contact from the same user
  if (contact.user_id && contact.user_id !== telegramUserId) {
    await sendMessage(chatId, '⚠️ Du kannst nur deine eigene Nummer teilen.', {
      removeKeyboard: true,
    })
    return
  }

  // Check if already linked
  const existing = await findPlayerByTelegramId(CLUB_ID, telegramUserId)
  if (existing) {
    await sendMessage(chatId, formatAlreadyLinked(existing.playerName), {
      removeKeyboard: true,
    })
    return
  }

  // Try to match
  const match = await findPlayerByPhone(CLUB_ID, contact.phone_number)

  if (!match) {
    await sendMessage(chatId, formatLinkFailed(), { removeKeyboard: true })
    return
  }

  // Link the player
  await linkTelegramToPlayer(
    CLUB_ID,
    match.playerId,
    telegramUserId,
    message.from?.username
  )

  await sendMessage(chatId, formatLinkSuccess(match.playerName), {
    removeKeyboard: true,
  })
}

// ─── /status ──────────────────────────────────────────────────────────────────

export async function handleStatusCommand(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id
  const chatType = message.chat.type
  const telegramUserId = message.from?.id

  if (chatType === 'private' && telegramUserId) {
    // DM: show personal link status
    const player = await findPlayerByTelegramId(CLUB_ID, telegramUserId)
    if (player) {
      await sendMessage(chatId, `✅ Du bist als <b>${player.playerName}</b> verknüpft.`)
    } else {
      await sendMessage(chatId, '❌ Du bist noch nicht verknüpft. Teile deine Telefonnummer mit /start.')
    }
    return
  }

  // Group: show team link status

  const teamsSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('teams')
    .where('telegramGroupId', '==', chatId)
    .limit(1)
    .get()

  if (teamsSnap.empty) {
    await sendMessage(chatId, '❌ Diese Gruppe ist noch nicht verknüpft. Verwende <b>/setup Mannschaftsname</b>.')
    return
  }

  const teamDoc = teamsSnap.docs[0]
  const teamData = teamDoc.data()
  const teamId = teamDoc.id

  // Count linked vs total players
  const playersSnap = await db
    .collection('clubs').doc(CLUB_ID)
    .collection('players')
    .where('teamIds', 'array-contains', teamId)
    .where('status', 'in', ['active', 'injured'])
    .get()

  const total = playersSnap.docs.length
  const linked = playersSnap.docs.filter(d => d.data().telegramUserId).length

  await sendMessage(chatId, [
    `ℹ️ <b>Status — ${teamData.name}</b>`,
    '',
    `👥 Spieler: ${total}`,
    `🔗 Verknüpft: ${linked}`,
    `⚠️ Nicht verknüpft: ${total - linked}`,
    '',
    linked < total
      ? `${total - linked} Spieler müssen sich noch verknüpfen.`
      : '✅ Alle Spieler sind verknüpft!',
  ].join('\n'))
}
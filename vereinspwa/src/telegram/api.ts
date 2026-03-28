/**
 * Telegram Bot API wrapper.
 * Uses native fetch (Node 20+). No external dependencies.
 */

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? ''

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${BOT_TOKEN()}/${method}`
}

// ─── Core Types ───────────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
  my_chat_member?: TelegramChatMemberUpdated
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  contact?: TelegramContact
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
}

export interface TelegramContact {
  phone_number: string
  first_name: string
  last_name?: string
  user_id?: number
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat
  from: TelegramUser
  new_chat_member: {
    status: string
    user: TelegramUser
  }
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
}

export interface ReplyKeyboardButton {
  text: string
  request_contact?: boolean
}

// ─── API Methods ──────────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown'
    inlineKeyboard?: InlineKeyboardButton[][]
    replyKeyboard?: ReplyKeyboardButton[][]
    removeKeyboard?: boolean
  }
): Promise<TelegramMessage | null> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode ?? 'HTML',
  }

  if (options?.inlineKeyboard) {
    body.reply_markup = { inline_keyboard: options.inlineKeyboard }
  } else if (options?.replyKeyboard) {
    body.reply_markup = {
      keyboard: options.replyKeyboard,
      one_time_keyboard: true,
      resize_keyboard: true,
    }
  } else if (options?.removeKeyboard) {
    body.reply_markup = { remove_keyboard: true }
  }

  const res = await callApi('sendMessage', body)
  return res?.result ?? null
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  inlineKeyboard?: InlineKeyboardButton[][]
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  }

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard }
  }

  const res = await callApi('editMessageText', body)
  return !!res?.ok
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await callApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text ?? '',
  })
}

export async function getChatMember(
  chatId: number,
  userId: number
): Promise<{ status: string } | null> {
  const res = await callApi('getChatMember', {
    chat_id: chatId,
    user_id: userId,
  })
  return res?.result ?? null
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function callApi(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; result?: any } | null> {
  try {
    const response = await fetch(apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!data.ok) {
      // Don't log "message is not modified" errors — they're expected
      // when a player taps a button but nothing changed
      const desc = data.description ?? ''
      if (!desc.includes('message is not modified')) {
        console.warn(`[Telegram API] ${method} failed:`, data.description)
      }
    }

    return data
  } catch (err) {
    console.error(`[Telegram API] ${method} error:`, err)
    return null
  }
}
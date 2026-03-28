/**
 * Telegram Webhook Handler.
 *
 * Receives POST requests from Telegram, parses the update,
 * and routes to the appropriate handler.
 *
 * Setup:
 * 1. Deploy this function
 * 2. Set webhook: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>"
 */

import type { TelegramUpdate } from './api'
import {
  handleSetupCommand,
  handleStartCommand,
  handleContact,
  handleStatusCommand,
} from './commands'
import { handleResponseCallback, handleCategoryCallback } from './responses'

export async function handleWebhook(update: TelegramUpdate): Promise<void> {
  try {
    // ── Callback Query (inline button press) ──
    if (update.callback_query) {
      const callback = update.callback_query
      const data = callback.data ?? ''

      // Response: r:EVENT_ID:a or r:EVENT_ID:d or r:EVENT_ID:back
      if (data.startsWith('r:')) {
        const parts = data.split(':')
        if (parts.length === 3) {
          await handleResponseCallback(callback, parts[1], parts[2])
        }
        return
      }

      // Decline category: c:EVENT_ID:injury/work/private
      if (data.startsWith('c:')) {
        const parts = data.split(':')
        if (parts.length === 3) {
          await handleCategoryCallback(callback, parts[1], parts[2])
        }
        return
      }

      return
    }

    // ── Regular message ──
    if (update.message) {
      const message = update.message

      // Contact shared (phone number for linking)
      if (message.contact) {
        await handleContact(message)
        return
      }

      // Text commands
      const text = (message.text ?? '').trim()

      if (text.startsWith('/setup')) {
        await handleSetupCommand(message)
        return
      }

      if (text.startsWith('/start')) {
        await handleStartCommand(message)
        return
      }

      if (text === '/status') {
        await handleStatusCommand(message)
        return
      }

      if (text === '/help') {
        const { sendMessage } = await import('./api')
        const isGroup = message.chat.type !== 'private'

        const helpText = isGroup
          ? [
              '🤖 <b>Vereinsmanager Bot — Befehle</b>',
              '',
              '<b>/setup Mannschaftsname</b> — Gruppe mit Team verknüpfen',
              '<b>/status</b> — Verknüpfungsstatus anzeigen',
              '<b>/help</b> — Diese Hilfe',
            ].join('\n')
          : [
              '🤖 <b>Vereinsmanager Bot — Befehle</b>',
              '',
              '<b>/start</b> — Verknüpfung starten (Telefonnummer teilen)',
              '<b>/status</b> — Deinen Verknüpfungsstatus anzeigen',
              '<b>/help</b> — Diese Hilfe',
              '',
              'Um dich zu verknüpfen, teile deine Telefonnummer über den Button.',
            ].join('\n')

        await sendMessage(message.chat.id, helpText)
        return
      }
    }
  } catch (err) {
    console.error('[webhook] Error handling update:', err)
    // Don't throw — Telegram retries on 5xx, which causes duplicate processing
  }
}
/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot webhook endpoint (Next.js API route for Netlify).
 *
 * After deploying, register with Telegram:
 * https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP.netlify.app/api/telegram/webhook
 */
import { handleWebhook } from '@/telegram/webhook'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })
  }

  try {
    const update = await request.json()
    await handleWebhook(update)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telegram/webhook]', err)
    // Always return 200 to Telegram — otherwise it retries
    return NextResponse.json({ ok: true })
  }
}

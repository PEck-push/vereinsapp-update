import { adminAuth } from '@/lib/firebase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = '__session'
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    })

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_DURATION_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[session] POST error:', error)
    return NextResponse.json(
      { error: 'Authentifizierung fehlgeschlagen' },
      { status: 401 }
    )
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE_NAME)
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[session] DELETE error:', error)
    return NextResponse.json({ error: 'Logout fehlgeschlagen' }, { status: 500 })
  }
}

/**
 * IMPORTANT: Firebase Admin SDK does NOT work in Edge Runtime.
 * This middleware must use the nodejs runtime.
 */
export const runtime = 'nodejs'

import { adminAuth } from '@/lib/firebase/admin'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = '__session'

const ADMIN_PREFIXES = ['/dashboard', '/calendar', '/players', '/events', '/stats', '/messages', '/settings']
const PLAYER_PREFIXES = ['/mein-bereich']
const PUBLIC_PREFIXES = ['/login', '/invite', '/api']

type RouteType = 'admin' | 'player' | 'public' | 'unknown'

function classifyRoute(pathname: string): RouteType {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return 'public'
  if (ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) return 'admin'
  if (PLAYER_PREFIXES.some((p) => pathname.startsWith(p))) return 'player'
  return 'unknown'
}

const ADMIN_ROLES = new Set(['admin', 'trainer', 'secretary'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const routeType = classifyRoute(pathname)

  if (routeType === 'public' || routeType === 'unknown') {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionCookie) return redirectToLogin(request)

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined

    if (routeType === 'admin') {
      if (role === 'player') {
        return NextResponse.redirect(new URL('/mein-bereich', request.url))
      }
      if (role && !ADMIN_ROLES.has(role)) {
        return redirectToLogin(request)
      }
    }

    if (routeType === 'player') {
      if (role && role !== 'player' && !ADMIN_ROLES.has(role)) {
        return redirectToLogin(request)
      }
    }

    return NextResponse.next()
  } catch (error) {
    console.warn('[middleware] Invalid session:', error)
    const response = redirectToLogin(request)
    response.cookies.delete(SESSION_COOKIE)
    return response
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

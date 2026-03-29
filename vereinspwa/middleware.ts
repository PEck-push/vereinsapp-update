/**
 * Middleware — Netlify-kompatibel (Edge Runtime).
 *
 * PROBLEM: Firebase Admin SDK funktioniert NICHT in Edge Runtime.
 * Netlify führt Middleware immer in Edge aus, egal was `runtime` sagt.
 *
 * LÖSUNG: Middleware prüft nur ob ein Session-Cookie EXISTIERT.
 * Die echte Verifikation (adminAuth.verifySessionCookie) passiert in:
 * - API Routes (server-side, Node.js)
 * - Firestore Security Rules (bei jedem DB-Zugriff)
 *
 * Das ist sicher weil:
 * 1. Ohne gültiges Cookie liefern API Routes 401
 * 2. Firestore Rules blocken jeden ungültigen Zugriff
 * 3. Die Middleware ist nur ein UX-Guard (Redirect statt Fehlerseite)
 */

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const routeType = classifyRoute(pathname)

  // Public routes and unknown routes: let through
  if (routeType === 'public' || routeType === 'unknown') {
    return NextResponse.next()
  }

  // Protected routes: check if session cookie exists
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value

  if (!sessionCookie) {
    // No cookie → redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Cookie exists → let through
  // Actual verification happens in API routes + Firestore Rules
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
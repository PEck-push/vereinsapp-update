/**
 * Server-side helper to resolve the clubId for the current request.
 *
 * - Single-tenant mode (default): returns CLUB_ID from env.
 * - Multi-tenant mode (NEXT_PUBLIC_MULTI_TENANT=true): reads clubId
 *   from the Firebase session cookie's custom claims.
 *
 * Usage in API routes:
 *   const clubId = await getClubIdFromSession()
 *   if (!clubId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */
import { adminAuth } from '@/lib/firebase/admin'
import { CLUB_ID, MULTI_TENANT } from '@/lib/config'
import { cookies } from 'next/headers'

export async function getClubIdFromSession(): Promise<string | null> {
  if (!MULTI_TENANT) {
    return CLUB_ID
  }

  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('__session')?.value
    if (!sessionCookie) return null

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const clubId = decoded.clubId as string | undefined
    if (!clubId) {
      // Fallback for users who haven't been migrated yet
      return CLUB_ID
    }
    return clubId
  } catch {
    return null
  }
}

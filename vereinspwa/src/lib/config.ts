/**
 * Static CLUB_ID — used by client-side code and as fallback in single-tenant mode.
 * In multi-tenant mode, server-side API routes should use getClubIdFromSession() instead.
 */
export const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? 'default-club'

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const MULTI_TENANT = process.env.NEXT_PUBLIC_MULTI_TENANT === 'true'

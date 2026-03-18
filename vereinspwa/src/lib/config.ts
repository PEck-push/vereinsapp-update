/**
 * TODO (Sprint 3 – Multi-Tenant):
 * CLUB_ID darf nicht mehr aus einer Env-Konstante kommen.
 * Stattdessen: aus dem Firebase Session Cookie Custom Claim lesen.
 * Beispiel: adminAuth.verifySessionCookie(cookie) → decodedClaims.clubId
 *
 * Für MVP reicht eine Konstante pro Deployment.
 */
export const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? 'default-club'

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

/**
 * Firebase Admin SDK – SERVER-SIDE ONLY.
 * Never import this file in client components or middleware Edge runtime.
 * Middleware must use nodejs runtime explicitly (see middleware.ts).
 *
 * NOTE: During Next.js build on Netlify, server-side code is executed to
 * collect page data. If Firebase Admin env vars are not set at build time,
 * we create a dummy/null admin instance to avoid crashing the build.
 * At runtime (when actually serving requests), the env vars MUST be present.
 */
import {
  cert,
  getApp as getAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  type App,
} from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

function hasAdminConfig(): boolean {
  return !!(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  )
}

function getOrCreateAdminApp(): App | null {
  if (getAdminApps().length > 0) {
    return getAdminApp('admin')
  }

  if (!hasAdminConfig()) {
    console.warn(
      '[Firebase Admin] Missing environment variables (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY). ' +
      'Admin SDK not initialized. This is expected during build — at runtime these must be set.'
    )
    return null
  }

  return initializeAdminApp(
    {
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        // Newlines are escaped in env vars – unescape them
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    },
    'admin'
  )
}

const adminApp = getOrCreateAdminApp()

// Export auth and db — they will throw at runtime if adminApp is null,
// which is correct behavior (requests should fail if config is missing).
// During build, Next.js only imports these but doesn't call methods on them
// for dynamic API routes.
export const adminAuth = adminApp ? getAuth(adminApp) : (null as unknown as Auth)
export const adminDb = adminApp ? getFirestore(adminApp) : (null as unknown as Firestore)
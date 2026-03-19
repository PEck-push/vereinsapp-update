import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import type { Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

/**
 * During Next.js static generation at build time, NEXT_PUBLIC_* env vars
 * may not be available. We guard initialization to avoid crashing the build.
 * At runtime in the browser, these vars are always inlined by Next.js.
 */
function getOrCreateApp(): FirebaseApp | null {
  if (getApps().length > 0) return getApp()

  // If API key is missing, we're likely in a build/SSG context
  if (!firebaseConfig.apiKey) {
    if (typeof window === 'undefined') {
      // Server-side during build — this is expected, don't crash
      console.warn('[Firebase Client] Missing NEXT_PUBLIC_FIREBASE_API_KEY — skipping init (expected during build)')
      return null
    }
    // Client-side but no key — this is a real error
    console.error('[Firebase Client] Missing NEXT_PUBLIC_FIREBASE_API_KEY — Firebase will not work')
    return null
  }

  return initializeApp(firebaseConfig)
}

const app = getOrCreateApp()

// Create safe proxy objects that won't crash during build
// but will work correctly at runtime when app is initialized
export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth)
export const db: Firestore = app ? getFirestore(app) : (null as unknown as Firestore)
export const storage: FirebaseStorage = app ? getStorage(app) : (null as unknown as FirebaseStorage)

// FCM is browser-only and requires HTTPS + service worker.
// Lazy-load to avoid SSR crashes and localhost issues.
export async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null
  if (!app) return null
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging')
    const supported = await isSupported()
    if (!supported) return null
    return getMessaging(app)
  } catch {
    return null
  }
}

export default app
/**
 * Firebase Admin SDK – SERVER-SIDE ONLY.
 * Never import this file in client components or middleware Edge runtime.
 * Middleware must use nodejs runtime explicitly (see middleware.ts).
 */
import {
  cert,
  getApp as getAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminConfig() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin environment variables. ' +
        'Ensure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, ' +
        'and FIREBASE_ADMIN_PRIVATE_KEY are set.'
    )
  }

  return cert({
    projectId,
    clientEmail,
    // Newlines are escaped in env vars – unescape them
    privateKey: privateKey.replace(/\\n/g, '\n'),
  })
}

const adminApp =
  getAdminApps().length === 0
    ? initializeAdminApp({ credential: getAdminConfig() }, 'admin')
    : getAdminApp('admin')

export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)

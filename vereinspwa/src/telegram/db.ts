/**
 * Shared Firestore instance for Telegram modules.
 *
 * In the Next.js app (Netlify), Firebase Admin is initialized via
 * @/lib/firebase/admin with a named app ('admin'). The bare
 * getFirestore() call expects a default app which doesn't exist.
 *
 * This module bridges that gap so all telegram/ modules can import
 * { db } from './db' instead of calling getFirestore() directly.
 */
import { adminDb } from '@/lib/firebase/admin'

export const db = adminDb

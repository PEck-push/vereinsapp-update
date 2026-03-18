import { getMessagingInstance } from '@/lib/firebase/client'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  return permission === 'granted' ? 'granted' : 'denied'
}

export async function registerFCMToken(playerId: string): Promise<void> {
  const messaging = await getMessagingInstance()
  if (!messaging) return
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  if (!vapidKey) { console.warn('[FCM] VAPID key not set'); return }
  try {
    const { getToken } = await import('firebase/messaging')
    const token = await getToken(messaging, { vapidKey })
    if (!token) return
    await updateDoc(doc(db, 'clubs', CLUB_ID, 'players', playerId), { fcmTokens: arrayUnion(token) })
  } catch (err) {
    console.warn('[FCM] Token registration failed:', err)
  }
}

export async function removeFCMToken(playerId: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', CLUB_ID, 'players', playerId), { fcmTokens: arrayRemove(token) })
}

'use client'

import { useState, useEffect } from 'react'
import { Bell, Check, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission, registerFCMToken } from '@/lib/firebase/messaging'
import { doc, increment as firestoreIncrement, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'

const SOFT_DECLINED_KEY = 'notification-soft-declined'
const COOLDOWN_DAYS = 7

interface NotificationBannerProps {
  playerId: string
}

function isIOSNotStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone = 'standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone
  return isIOS && !isStandalone
}

function trackAnalytics(field: 'shown' | 'granted' | 'declined') {
  try {
    const ref = doc(db, 'clubs', CLUB_ID, 'analytics', 'notifications')
    setDoc(ref, { [field]: firestoreIncrement(1) }, { merge: true })
  } catch {
    // Non-blocking analytics
  }
}

export function NotificationBanner({ playerId }: NotificationBannerProps) {
  const [stage, setStage] = useState<'hidden' | 'soft' | 'success'>('hidden')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already granted
    if ('Notification' in window && Notification.permission === 'granted') return
    // Already denied by browser — don't show
    if ('Notification' in window && Notification.permission === 'denied') return

    // Check cooldown
    const declined = localStorage.getItem(SOFT_DECLINED_KEY)
    if (declined) {
      const declinedAt = parseInt(declined, 10)
      if (Date.now() - declinedAt < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return
    }

    // Show after short delay
    const t = setTimeout(() => {
      setStage('soft')
      trackAnalytics('shown')
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  if (stage === 'hidden') return null

  const isIOSWeb = isIOSNotStandalone()

  async function handleActivate() {
    if (isIOSWeb) {
      // Can't request permission in Safari web — just dismiss with info
      setStage('hidden')
      return
    }

    const result = await requestNotificationPermission()
    if (result === 'granted') {
      await registerFCMToken(playerId)
      trackAnalytics('granted')

      // Post config to service worker for background messages
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        reg.active?.postMessage({
          type: 'FIREBASE_CONFIG',
          config: {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          },
        })
      }

      setStage('success')
      setTimeout(() => setStage('hidden'), 3000)
    } else {
      trackAnalytics('declined')
      localStorage.setItem(SOFT_DECLINED_KEY, String(Date.now()))
      setStage('hidden')
    }
  }

  function handleDismiss() {
    trackAnalytics('declined')
    localStorage.setItem(SOFT_DECLINED_KEY, String(Date.now()))
    setStage('hidden')
  }

  // Success state
  if (stage === 'success') {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Benachrichtigungen aktiviert</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-white rounded-lg border shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            {isIOSWeb ? <Download className="w-4 h-4 text-white" /> : <Bell className="w-4 h-4 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {isIOSWeb ? 'App installieren' : 'Benachrichtigungen'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isIOSWeb
                ? 'Installiere die App auf deinem Home-Bildschirm um Benachrichtigungen zu erhalten.'
                : 'Erhalte Erinnerungen 2h vor dem Training — direkt auf dein Handy.'
              }
            </p>
            <div className="flex gap-2 mt-3">
              {isIOSWeb ? (
                <Button
                  size="sm"
                  onClick={handleDismiss}
                  style={{ backgroundColor: '#1a1a2e', fontSize: '12px' }}
                >
                  Verstanden
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleActivate}
                    style={{ backgroundColor: '#e94560', fontSize: '12px' }}
                  >
                    Aktivieren
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    className="text-gray-500 text-xs"
                  >
                    Später
                  </Button>
                </>
              )}
            </div>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

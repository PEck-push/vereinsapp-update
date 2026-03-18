'use client'

import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission, registerFCMToken } from '@/lib/firebase/messaging'

interface NotificationBannerProps {
  playerId: string
}

export function NotificationBanner({ playerId }: NotificationBannerProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Only show if permission is 'default' (not yet decided)
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      // Small delay to not interrupt page load
      const t = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(t)
    }
  }, [])

  if (!show) return null

  async function handleAllow() {
    const result = await requestNotificationPermission()
    if (result === 'granted') {
      await registerFCMToken(playerId)
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
    }
    setShow(false)
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-white rounded-lg border shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Benachrichtigungen
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Darf die App dich über neue Termine informieren?
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleAllow}
                style={{ backgroundColor: '#e94560', fontSize: '12px' }}
              >
                Erlauben
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShow(false)}
                className="text-gray-500 text-xs"
              >
                Später
              </Button>
            </div>
          </div>
          <button onClick={() => setShow(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

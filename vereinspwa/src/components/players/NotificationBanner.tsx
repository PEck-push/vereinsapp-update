'use client'

import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestNotificationPermission, getOrUpdateFCMToken } from '@/lib/firebase/messaging'

interface NotificationBannerProps {
  playerId: string
  onDismiss: () => void
}

export function NotificationBanner({ playerId, onDismiss }: NotificationBannerProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleAllow() {
    setLoading(true)
    try {
      const result = await requestNotificationPermission()
      if (result === 'granted') {
        await getOrUpdateFCMToken(playerId)
      }
    } finally {
      setLoading(false)
      setDone(true)
      setTimeout(onDismiss, 1000)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-sm text-green-800">
        <Bell className="w-4 h-4" />
        Benachrichtigungen aktiviert!
      </div>
    )
  }

  return (
    <div
      className="bg-white border rounded-lg p-4 flex items-start gap-3"
      style={{ borderRadius: '8px', borderColor: '#e9ecef' }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        <Bell className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">Benachrichtigungen aktivieren</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Erhalte sofortige Meldungen bei neuen Terminen und Änderungen.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleAllow}
            disabled={loading}
            style={{ backgroundColor: '#e94560', borderRadius: '6px' }}
          >
            {loading ? 'Wird aktiviert…' : 'Erlauben'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} className="text-gray-500">
            Später
          </Button>
        </div>
      </div>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

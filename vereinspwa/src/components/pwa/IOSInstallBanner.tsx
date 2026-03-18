'use client'

import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'

export function IOSInstallBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    const dismissed = localStorage.getItem('ios-install-dismissed')

    if (isIOS && !isStandalone && !dismissed) {
      // Small delay so it doesn't flash on first render
      const t = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    localStorage.setItem('ios-install-dismissed', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6"
      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.05), transparent)' }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-100 p-4 flex items-start gap-3"
        role="banner"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          <span className="text-white font-bold text-sm">V</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">App installieren</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Für die beste Erfahrung: Tippe auf{' '}
            <Share className="w-3.5 h-3.5 inline -mt-0.5 text-blue-500" />{' '}
            und wähle <strong>„Zum Home-Bildschirm"</strong>
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-gray-400 hover:text-gray-600 shrink-0 p-1"
          aria-label="Schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

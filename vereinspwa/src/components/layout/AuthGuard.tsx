'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Auth Guard — redirects to /login if no Firebase user is signed in.
 *
 * This replaces the middleware-based auth check which doesn't work
 * reliably on Netlify (Edge Runtime vs Node.js Runtime issue).
 *
 * Place this inside any layout that needs authentication.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    if (!auth) {
      setState('unauthenticated')
      return
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setState('authenticated')
      } else {
        setState('unauthenticated')
        router.replace(`/login?from=${encodeURIComponent(pathname)}`)
      }
    })

    return unsub
  }, [router, pathname])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: '#f8f9fa' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <p className="text-sm text-gray-400">Wird geladen...</p>
        </div>
      </div>
    )
  }

  if (state === 'unauthenticated') {
    // Show nothing while redirecting
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: '#f8f9fa' }}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return <>{children}</>
}
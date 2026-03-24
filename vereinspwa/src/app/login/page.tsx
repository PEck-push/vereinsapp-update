'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2 } from 'lucide-react'

interface ClubBranding {
  name: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
}

function useClubBranding(): ClubBranding {
  const [branding, setBranding] = useState<ClubBranding>({
    name: 'Vereinsmanagement',
    logoUrl: null,
    primaryColor: '#1a1a2e',
    secondaryColor: '#e94560',
  })

  useEffect(() => {
    if (!db) return
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'clubs', CLUB_ID))
        if (snap.exists()) {
          const data = snap.data()
          setBranding({
            name: data.name || 'Vereinsmanagement',
            logoUrl: data.logoUrl || null,
            primaryColor: data.primaryColor || '#1a1a2e',
            secondaryColor: data.secondaryColor || '#e94560',
          })
        }
      } catch { /* fallback to defaults */ }
    }
    load()
  }, [])

  return branding
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('from') ?? null
  const branding = useClubBranding()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) { setError('Firebase nicht initialisiert. Bitte Seite neu laden.'); return }
    setError(null)
    setLoading(true)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const idToken = await credential.user.getIdToken(true)
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) throw new Error('Session error')

      const tokenResult = await credential.user.getIdTokenResult()
      const role = tokenResult.claims.role as string | undefined

      if (redirectTo) {
        router.push(redirectTo)
      } else if (role === 'player') {
        router.push('/mein-bereich')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-email'].includes(code)) {
        setError('Ungültige E-Mail oder Passwort.')
      } else if (code === 'auth/too-many-requests') {
        setError('Zu viele Anmeldeversuche. Bitte versuche es später erneut.')
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Logo */}
      <div className="flex justify-center mb-8">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="w-16 h-16 rounded-xl object-contain"
            style={{ backgroundColor: branding.primaryColor }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: branding.primaryColor }}
          >
            <span className="text-white font-bold text-xl">
              {branding.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <Card className="shadow-sm border-0" style={{ borderRadius: '8px' }}>
        <CardHeader className="pb-4">
          <CardTitle
            className="text-2xl font-semibold text-center"
            style={{ fontFamily: 'Outfit, sans-serif', color: branding.primaryColor }}
          >
            Anmelden
          </CardTitle>
          <CardDescription className="text-center text-sm text-gray-500">
            {branding.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@verein.at"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button
              type="submit"
              className="w-full font-medium"
              disabled={loading}
              style={{
                backgroundColor: branding.secondaryColor,
                borderRadius: '6px',
                color: '#ffffff',
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Anmelden…</>
              ) : (
                'Anmelden'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-gray-400 mt-6">
        Passwort vergessen? Wende dich an den Administrator.
      </p>
    </>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <Card className="shadow-sm border-0" style={{ borderRadius: '8px' }}>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </CardContent>
            </Card>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
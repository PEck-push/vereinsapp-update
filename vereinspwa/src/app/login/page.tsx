'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2 } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('from') ?? null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) {
      setError('Firebase nicht initialisiert. Bitte Seite neu laden.')
      return
    }
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
      if (['auth/user-not-found','auth/wrong-password','auth/invalid-credential','auth/invalid-email'].includes(code)) {
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
    <Card className="shadow-sm border-0" style={{ borderRadius: '8px' }}>
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-semibold text-center" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
          Anmelden
        </CardTitle>
        <CardDescription className="text-center text-sm text-gray-500">Vereinsmanagement</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" placeholder="email@verein.at" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" disabled={loading} />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full font-medium" disabled={loading} style={{ backgroundColor: '#e94560', borderRadius: '6px', color: '#ffffff' }}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Anmelden…</> : 'Anmelden'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
            <span className="text-white font-bold text-xl">V</span>
          </div>
        </div>
        <Suspense fallback={
          <Card className="shadow-sm border-0" style={{ borderRadius: '8px' }}>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </CardContent>
          </Card>
        }>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-gray-400 mt-6">Passwort vergessen? Wende dich an den Administrator.</p>
      </div>
    </main>
  )
}
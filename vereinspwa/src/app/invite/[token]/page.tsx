'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

const passwordSchema = z.object({
  password: z.string().min(8, 'Mindestens 8 Zeichen').regex(/[A-Z]/, 'Mindestens ein Großbuchstabe').regex(/[0-9]/, 'Mindestens eine Zahl'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwörter stimmen nicht überein', path: ['confirmPassword'] })

type FormValues = z.infer<typeof passwordSchema>
type PageState =
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'form'; firstName: string; email: string; playerId: string }
  | { step: 'success' }

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<PageState>({ step: 'loading' })
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(passwordSchema),
  })

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch('/api/auth/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) setState({ step: 'error', message: data.error })
        else setState({ step: 'form', firstName: data.firstName, email: data.email, playerId: data.playerId })
      } catch {
        setState({ step: 'error', message: 'Verbindungsfehler. Bitte versuche es erneut.' })
      }
    }
    validate()
  }, [token])

  async function onSubmit(values: FormValues) {
    if (state.step !== 'form') return
    setSubmitError(null)

    try {
      // 1. Create Firebase Auth account
      const credential = await createUserWithEmailAndPassword(auth, state.email, values.password)

      // 2. Mark token as used + save UID (Admin SDK via API)
      const patchRes = await fetch('/api/auth/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: state.playerId, uid: credential.user.uid }),
      })
      if (!patchRes.ok) throw new Error('Account konnte nicht aktiviert werden.')

      // 3. Get fresh idToken, set Custom Claims + create session cookie
      const idToken = await credential.user.getIdToken(true)
      const claimsRes = await fetch('/api/auth/set-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, playerId: state.playerId }),
      })
      if (!claimsRes.ok) throw new Error('Berechtigungen konnten nicht gesetzt werden.')

      setState({ step: 'success' })
      setTimeout(() => router.push('/mein-bereich'), 2000)
    } catch (err) {
      const code = (err as AuthError)?.code
      if (code === 'auth/email-already-in-use') {
        setSubmitError('Diese E-Mail hat bereits einen Account. Bitte einloggen.')
      } else {
        setSubmitError((err as Error).message ?? 'Registrierung fehlgeschlagen.')
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#f8f9fa' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
            <span className="text-white font-bold text-xl">V</span>
          </div>
        </div>

        {state.step === 'loading' && (
          <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></CardContent></Card>
        )}

        {state.step === 'error' && (
          <Card>
            <CardHeader><CardTitle className="text-lg text-center text-red-600">Link ungültig</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{state.message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {state.step === 'form' && (
          <Card className="shadow-sm border-0">
            <CardHeader>
              <CardTitle className="text-xl" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
                Hallo {state.firstName}!
              </CardTitle>
              <CardDescription>Lege jetzt dein Passwort fest.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>E-Mail</Label>
                  <Input type="email" value={state.email} readOnly className="bg-gray-50 text-gray-500" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Passwort</Label>
                  <Input id="password" type="password" placeholder="Min. 8 Zeichen, 1 Großbuchstabe, 1 Zahl" {...register('password')} />
                  {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
                </div>
                {submitError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                    <AlertCircle className="w-4 h-4 shrink-0" />{submitError}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isSubmitting} style={{ backgroundColor: '#e94560' }}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Registrieren
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {state.step === 'success' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>Willkommen!</p>
              <p className="text-sm text-gray-500 text-center">Dein Account wurde erstellt. Du wirst weitergeleitet…</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

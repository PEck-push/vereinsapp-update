'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { usePlayerProfile } from '@/lib/hooks/usePlayerProfile'
import { useEvents } from '@/lib/hooks/useEvents'
import { ResponseDialog } from '@/components/events/ResponseDialog'
import { NotificationBanner } from '@/components/events/NotificationBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle, Bell, Calendar, Camera, Check,
  ChevronDown, ChevronUp, KeyRound, Loader2, LogOut, Phone, User,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ClubEvent, Player } from '@/lib/types'
import {
  collection, onSnapshot, query, where, doc, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort erforderlich'),
  newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwörter stimmen nicht überein', path: ['confirmPassword'] })
type PasswordForm = z.infer<typeof passwordSchema>

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  active: { label: 'Aktiv', variant: 'success' },
  injured: { label: 'Verletzt', variant: 'warning' },
  inactive: { label: 'Inaktiv', variant: 'muted' },
}

type Tab = 'overview' | 'profile'

export default function MeinBereichPage() {
  const { state, updateProfile, reload } = usePlayerProfile()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')

  if (state.status === 'loading') return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (state.status === 'error') return <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-4 rounded-md"><AlertCircle className="w-4 h-4" />{state.message}</div>

  const { player } = state

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <div className="max-w-xl pb-12">
      {/* Nav */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg">
        {(['overview', 'profile'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'overview' ? 'Übersicht' : 'Mein Profil'}
          </button>
        ))}
        <button onClick={handleLogout} className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 flex items-center gap-1">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {tab === 'overview' && <OverviewTab player={player} />}
      {tab === 'profile' && <ProfileTab player={player} updateProfile={updateProfile} onPhotoUpdate={reload} />}

      <NotificationBanner playerId={player.id} />
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ player }: { player: Player }) {
  const { events, loading } = useEvents()
  const [myResponses, setMyResponses] = useState<Record<string, string>>({})
  const [responseEvent, setResponseEvent] = useState<ClubEvent | null>(null)
  const [showPast, setShowPast] = useState(false)
  const { submitResponse } = useEvents()

  const now = new Date()

  // Filter events for this player's teams
  const myEvents = useMemo(() =>
    events.filter((e) => e.teamIds.some((id) => player.teamIds.includes(id))),
    [events, player.teamIds]
  )

  const upcoming = myEvents.filter((e) => {
    const d = (e.startDate as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(e.startDate as unknown as string)
    return d >= now
  })

  const past = myEvents.filter((e) => {
    const d = (e.startDate as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(e.startDate as unknown as string)
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return d < now && d >= cutoff
  })

  // Load my responses
  useEffect(() => {
    if (!player.id) return
    const eventIds = myEvents.map((e) => e.id)
    if (eventIds.length === 0) return
    const unsubs = eventIds.map((eventId) => {
      const ref = doc(db, 'clubs', CLUB_ID, 'events', eventId, 'responses', player.id)
      return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          setMyResponses((prev) => ({ ...prev, [eventId]: snap.data().status }))
        }
      })
    })
    return () => unsubs.forEach((u) => u())
  }, [myEvents, player.id])

  function getResponseBadge(eventId: string) {
    const status = myResponses[eventId]
    if (status === 'accepted') return <Badge variant="success">Zugesagt</Badge>
    if (status === 'declined') return <Badge variant="destructive" className="bg-red-100 text-red-700 border-0">Abgesagt</Badge>
    return <Badge variant="muted">Ausstehend</Badge>
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <p className="text-lg font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
          Hallo {player.firstName}! 👋
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{upcoming.length} kommende Termine</p>
      </div>

      {/* Upcoming Events */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Kommende Termine</h2>
        {upcoming.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
            <Calendar className="w-7 h-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Keine kommenden Termine</p>
          </div>
        ) : (
          upcoming.map((event) => <EventCard key={event.id} event={event} responseBadge={getResponseBadge(event.id)} hasResponse={!!myResponses[event.id]} onAnswer={() => setResponseEvent(event)} />)
        )}
      </div>

      {/* Past Events */}
      {past.length > 0 && (
        <div>
          <button onClick={() => setShowPast((p) => !p)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 w-full">
            Vergangene Termine ({past.length})
            {showPast ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showPast && (
            <div className="space-y-2 mt-2">
              {past.map((event) => <EventCard key={event.id} event={event} responseBadge={getResponseBadge(event.id)} hasResponse={!!myResponses[event.id]} onAnswer={() => {}} isPast />)}
            </div>
          )}
        </div>
      )}

      <ResponseDialog
        open={!!responseEvent}
        event={responseEvent}
        playerId={player.id}
        onClose={() => setResponseEvent(null)}
        onSubmit={submitResponse}
      />
    </div>
  )
}

function EventCard({ event, responseBadge, hasResponse, onAnswer, isPast }: {
  event: ClubEvent; responseBadge: React.ReactNode; hasResponse: boolean; onAnswer: () => void; isPast?: boolean
}) {
  const d = (event.startDate as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(event.startDate as unknown as string)
  const dateStr = d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeStr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })

  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Besprechung', other: 'Termin' }

  return (
    <div className={`bg-white rounded-lg border p-4 ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400">{TYPE_LABELS[event.type] ?? 'Termin'}</span>
            {responseBadge}
          </div>
          <p className="font-medium text-gray-900 text-sm truncate">{event.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{dateStr} · {timeStr} Uhr{event.location && ` · ${event.location}`}</p>
        </div>
        {!isPast && !hasResponse && (
          <Button onClick={onAnswer} size="sm" variant="outline" className="shrink-0 text-xs">
            Antworten
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────
function ProfileTab({ player, updateProfile, onPhotoUpdate }: {
  player: Player
  updateProfile: (data: Partial<Pick<Player, 'phone' | 'notificationPrefs'>>) => Promise<void>
  onPhotoUpdate: () => void
}) {
  return (
    <div className="space-y-4">
      <ProfileHeader player={player} onPhotoUpdate={onPhotoUpdate} />
      <ContactSection phone={player.phone} onSave={(phone) => updateProfile({ phone })} />
      <NotificationSection prefs={player.notificationPrefs} onSave={(prefs) => updateProfile({ notificationPrefs: prefs })} />
      <PasswordSection />
    </div>
  )
}

function ProfileHeader({ player, onPhotoUpdate }: { player: Player; onPhotoUpdate: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>((player as unknown as Record<string, string>).photoUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusInfo = STATUS_LABELS[player.status] ?? STATUS_LABELS.active

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setUploading(true)
    try {
      const sRef = storageRef(storage, `clubs/${CLUB_ID}/players/${player.id}/avatar`)
      await uploadBytes(sRef, file, { contentType: file.type })
      const url = await getDownloadURL(sRef)
      await fetch('/api/player/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoUrl: url }) })
      setPhotoUrl(url); onPhotoUpdate()
    } finally { setUploading(false) }
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-semibold" style={{ backgroundColor: '#1a1a2e' }}>
            {photoUrl ? <img src={photoUrl} alt="Profilbild" className="w-full h-full object-cover" /> : `${player.firstName[0]}${player.lastName[0]}`}
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center hover:bg-gray-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" /> : <Camera className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {player.firstName} {player.lastName}
            {player.jerseyNumber && <span className="ml-2 text-base font-normal text-gray-400">#{player.jerseyNumber}</span>}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {player.position && <span className="text-sm text-gray-500">{player.position}</span>}
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1 truncate">{player.email}</p>
        </div>
      </div>
    </div>
  )
}

function ContactSection({ phone, onSave }: { phone?: string; onSave: (phone: string) => Promise<void> }) {
  const [value, setValue] = useState(phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  async function handleSave() { setSaving(true); try { await onSave(value); setSaved(true); setTimeout(() => setSaved(false), 2000) } finally { setSaving(false) } }
  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center gap-2 mb-4"><Phone className="w-4 h-4 text-gray-400" /><h2 className="text-sm font-semibold text-gray-700">Kontakt</h2></div>
      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-xs text-gray-500">Telefonnummer</Label>
        <div className="flex gap-2">
          <Input id="phone" type="tel" value={value} onChange={(e) => setValue(e.target.value)} placeholder="+43 664 123 456" className="flex-1" />
          <Button onClick={handleSave} disabled={saving || value === (phone ?? '')} variant="outline" size="sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4 text-green-500" /> : 'Speichern'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function NotificationSection({ prefs, onSave }: { prefs: { push: boolean; email: boolean }; onSave: (p: { push: boolean; email: boolean }) => Promise<void> }) {
  const [push, setPush] = useState(prefs.push)
  const [email, setEmail] = useState(prefs.email)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isDirty = push !== prefs.push || email !== prefs.email
  async function handleSave() { setSaving(true); try { await onSave({ push, email }); setSaved(true); setTimeout(() => setSaved(false), 2000) } finally { setSaving(false) } }
  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center gap-2 mb-4"><Bell className="w-4 h-4 text-gray-400" /><h2 className="text-sm font-semibold text-gray-700">Benachrichtigungen</h2></div>
      <div className="space-y-4">
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-800">Push</p><p className="text-xs text-gray-400">Termine in Echtzeit</p></div><Switch checked={push} onCheckedChange={setPush} /></div>
        <Separator />
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-800">E-Mail</p><p className="text-xs text-gray-400">Zusammenfassungen</p></div><Switch checked={email} onCheckedChange={setEmail} /></div>
      </div>
      {isDirty && <div className="mt-4"><Button onClick={handleSave} disabled={saving} size="sm" style={{ backgroundColor: '#e94560' }}>{saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern…</> : saved ? <><Check className="w-4 h-4 mr-2" />Gespeichert</> : 'Speichern'}</Button></div>}
    </div>
  )
}

function PasswordSection() {
  const [expanded, setExpanded] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })
  async function onSubmit(values: PasswordForm) {
    setServerError(null)
    const user = auth.currentUser
    if (!user?.email) return
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, values.currentPassword))
      await updatePassword(user, values.newPassword)
      setSuccess(true); reset()
      setTimeout(() => { setSuccess(false); setExpanded(false) }, 2500)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setServerError('Aktuelles Passwort ist falsch.')
      else setServerError('Passwort konnte nicht geändert werden.')
    }
  }
  return (
    <div className="bg-white rounded-lg border p-5">
      <button onClick={() => setExpanded((p) => !p)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-gray-400" /><span className="text-sm font-semibold text-gray-700">Passwort ändern</span></div>
        <span className="text-xs text-gray-400">{expanded ? 'Schließen' : 'Ändern'}</span>
      </button>
      {expanded && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
          <div className="space-y-1.5"><Label className="text-xs text-gray-500">Aktuelles Passwort</Label><Input type="password" autoComplete="current-password" {...register('currentPassword')} />{errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}</div>
          <div className="space-y-1.5"><Label className="text-xs text-gray-500">Neues Passwort</Label><Input type="password" placeholder="Min. 8 Zeichen, 1 Großbuchstabe, 1 Zahl" autoComplete="new-password" {...register('newPassword')} />{errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}</div>
          <div className="space-y-1.5"><Label className="text-xs text-gray-500">Neues Passwort bestätigen</Label><Input type="password" autoComplete="new-password" {...register('confirmPassword')} />{errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}</div>
          {serverError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md"><AlertCircle className="w-4 h-4 shrink-0" />{serverError}</div>}
          {success && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md"><Check className="w-4 h-4 shrink-0" />Passwort erfolgreich geändert.</div>}
          <Button type="submit" disabled={isSubmitting} size="sm" style={{ backgroundColor: '#e94560' }}>{isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern…</> : 'Passwort speichern'}</Button>
        </form>
      )}
    </div>
  )
}

'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { usePlayerProfile } from '@/lib/hooks/usePlayerProfile'
import { useEvents } from '@/lib/hooks/useEvents'
import { EventResponseDialog } from '@/components/events/EventResponseDialog'
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
  AlertCircle, Bell, Calendar, Camera, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, ClipboardCopy, ExternalLink, KeyRound,
  Loader2, LogOut, Phone, User,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ClubEvent, DeclineCategory, Player } from '@/lib/types'
import {
  collection, onSnapshot, query, where, doc, getDoc, Timestamp,
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

const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

type Tab = 'overview' | 'calendar' | 'profile'

function toDate(d: unknown): Date {
  if (d instanceof Timestamp) return d.toDate()
  if (d instanceof Date) return d
  if (d && typeof d === 'object' && 'toDate' in d) return (d as { toDate: () => Date }).toDate()
  return new Date(d as string)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

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
        {(['overview', 'calendar', 'profile'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'overview' ? 'Übersicht' : t === 'calendar' ? 'Kalender' : 'Mein Profil'}
          </button>
        ))}
        <button onClick={handleLogout} className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 flex items-center gap-1">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {tab === 'overview' && <OverviewTab player={player} />}
      {tab === 'calendar' && <CalendarTab player={player} />}
      {tab === 'profile' && <ProfileTab player={player} updateProfile={updateProfile} onPhotoUpdate={reload} />}

      <NotificationBanner playerId={player.id} />
    </div>
  )
}

// ─── API-based response submission ────────────────────────────────────────────

async function submitResponseViaAPI(
  eventId: string,
  playerId: string,
  response: {
    playerId: string
    status: 'accepted' | 'declined'
    declineCategory?: DeclineCategory
    reason?: string
  }
): Promise<void> {
  const res = await fetch('/api/player/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId,
      status: response.status,
      declineCategory: response.declineCategory,
      reason: response.reason,
    }),
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Antwort konnte nicht gespeichert werden.')
  }
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ player }: { player: Player }) {
  const { events, loading } = useEvents()
  const [myResponses, setMyResponses] = useState<Record<string, string>>({})
  const [responseEvent, setResponseEvent] = useState<ClubEvent | null>(null)
  const [showPast, setShowPast] = useState(false)

  const now = new Date()

  // Filter events for this player's teams + club-wide events (empty teamIds)
  const myEvents = useMemo(() =>
    events.filter((e) =>
      e.teamIds.length === 0 || e.teamIds.some((id) => player.teamIds.includes(id))
    ),
    [events, player.teamIds]
  )

  const upcoming = myEvents.filter((e) => {
    const d = toDate(e.startDate)
    return d >= now && e.status !== 'cancelled'
  }).sort((a, b) => toDate(a.startDate).getTime() - toDate(b.startDate).getTime())

  const past = myEvents.filter((e) => {
    const d = toDate(e.startDate)
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return d < now && d >= cutoff
  }).sort((a, b) => toDate(b.startDate).getTime() - toDate(a.startDate).getTime())

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
        } else {
          // Clear response if doc was deleted
          setMyResponses((prev) => {
            const next = { ...prev }
            delete next[eventId]
            return next
          })
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
          upcoming.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              responseBadge={getResponseBadge(event.id)}
              hasResponse={!!myResponses[event.id]}
              onAnswer={() => setResponseEvent(event)}
            />
          ))
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
              {past.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  responseBadge={getResponseBadge(event.id)}
                  hasResponse={!!myResponses[event.id]}
                  onAnswer={() => {}}
                  isPast
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* FIX: Use API-based submission via onSubmit prop so counters update correctly */}
      <EventResponseDialog
        open={!!responseEvent}
        event={responseEvent}
        playerId={player.id}
        existingResponse={responseEvent ? (myResponses[responseEvent.id] as 'accepted' | 'declined' | undefined) ?? null : null}
        onSubmit={submitResponseViaAPI}
        onClose={() => setResponseEvent(null)}
      />
    </div>
  )
}

function EventCard({ event, responseBadge, hasResponse, onAnswer, isPast }: {
  event: ClubEvent; responseBadge: React.ReactNode; hasResponse: boolean; onAnswer: () => void; isPast?: boolean
}) {
  const d = toDate(event.startDate)
  const dateStr = d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeStr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })

  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Besprechung', event: 'Vereins-Event', other: 'Termin' }

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
        {/* FIX: Always show button for non-past events — "Ändern" if already responded */}
        {!isPast && (
          <Button onClick={onAnswer} size="sm" variant="outline" className="shrink-0 text-xs">
            {hasResponse ? 'Ändern' : 'Antworten'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ player }: { player: Player }) {
  const { events, loading } = useEvents()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [icalToken, setIcalToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Load iCal token from club document
  useEffect(() => {
    if (!db) return
    const unsub = onSnapshot(doc(db, 'clubs', CLUB_ID), (snap) => {
      if (snap.exists()) {
        setIcalToken(snap.data()?.settings?.icalToken ?? null)
      }
    })
    return unsub
  }, [])

  // Filter to player's teams + club-wide events
  const myEvents = useMemo(() =>
    events.filter((e) =>
      e.status !== 'cancelled' &&
      (e.teamIds.length === 0 || e.teamIds.some((id) => player.teamIds.includes(id)))
    ),
    [events, player.teamIds]
  )

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null) }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null) }

  // Build calendar grid
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1) }
  const firstDayOfWeek = (days[0].getDay() + 6) % 7
  const paddingBefore = Array.from({ length: firstDayOfWeek }, (_, i) => new Date(year, month, -firstDayOfWeek + i + 1))
  const allCells = [...paddingBefore, ...days]
  const remaining = (7 - (allCells.length % 7)) % 7
  const grid = [...allCells, ...Array.from({ length: remaining }, (_, i) => new Date(year, month + 1, i + 1))]

  const selectedDayEvents = selectedDate
    ? myEvents.filter(e => isSameDay(toDate(e.startDate), selectedDate)).sort((a, b) => toDate(a.startDate).getTime() - toDate(b.startDate).getTime())
    : []

  function buildICalUrl(teamId?: string): string {
    const base = `${appUrl}/api/ical?clubId=${CLUB_ID}`
    const withTeam = teamId ? `${base}&teamId=${teamId}` : base
    return icalToken ? `${withTeam}&token=${icalToken}` : withTeam
  }

  function buildWebcalUrl(teamId?: string): string {
    return buildICalUrl(teamId).replace(/^https?:\/\//, 'webcal://')
  }

  function buildGoogleCalUrl(teamId?: string): string {
    const url = buildICalUrl(teamId)
    return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`
  }

  function copyUrl(url: string, key: string) {
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // Load team names for display
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!db || player.teamIds.length === 0) return
    const unsubs = player.teamIds.map(teamId => {
      return onSnapshot(doc(db, 'clubs', CLUB_ID, 'teams', teamId), (snap) => {
        if (snap.exists()) {
          setTeamNames(prev => ({ ...prev, [teamId]: snap.data().name }))
        }
      })
    })
    return () => unsubs.forEach(u => u())
  }, [player.teamIds])

  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Besprechung', event: 'Vereins-Event', other: 'Termin' }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>{MONTHS[month]} {year}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((cellDate, i) => {
            const isCurrentMonth = cellDate.getMonth() === month
            const isToday = isSameDay(cellDate, today)
            const isSelected = selectedDate && isSameDay(cellDate, selectedDate)
            const dayEvents = myEvents.filter(e => isSameDay(toDate(e.startDate), cellDate))
            const hasEvents = dayEvents.length > 0

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(cellDate)}
                className={`min-h-[52px] p-1 border-b border-r text-left transition-colors ${
                  !isCurrentMonth ? 'bg-gray-50' : 'hover:bg-gray-50'
                } ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                  isToday ? 'text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                }`}
                  style={isToday ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}
                >
                  {cellDate.getDate()}
                </span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5 justify-center">
                    {dayEvents.slice(0, 3).map((_, idx) => (
                      <span key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--club-secondary, #e94560)' }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Day Events */}
      {selectedDate && (
        <div className="bg-white rounded-lg border p-4" style={{ borderRadius: '8px' }}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {selectedDate.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Termine.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map(ev => {
                const time = toDate(ev.startDate).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={ev.id} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400">{TYPE_LABELS[ev.type] ?? 'Termin'}</span>
                      <span className="text-xs text-gray-400 ml-auto">{time} Uhr</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                    {ev.location && <p className="text-xs text-gray-500 mt-0.5">{ev.location}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Calendar Subscriptions */}
      {icalToken && appUrl && (
        <div className="bg-white rounded-lg border p-4 space-y-3" style={{ borderRadius: '8px' }}>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Kalender abonnieren</h3>
          </div>
          <p className="text-xs text-gray-400">Termine automatisch in deinem Kalender anzeigen.</p>

          {/* One link per team the player belongs to */}
          {player.teamIds.map(teamId => (
            <CalendarSubRow
              key={teamId}
              label={teamNames[teamId] ?? 'Team'}
              webcalUrl={buildWebcalUrl(teamId)}
              googleUrl={buildGoogleCalUrl(teamId)}
              httpsUrl={buildICalUrl(teamId)}
              copied={copied === teamId}
              onCopy={() => copyUrl(buildICalUrl(teamId), teamId)}
            />
          ))}

          {/* All events link */}
          <CalendarSubRow
            label="Alle Vereinstermine"
            webcalUrl={buildWebcalUrl()}
            googleUrl={buildGoogleCalUrl()}
            httpsUrl={buildICalUrl()}
            copied={copied === 'all'}
            onCopy={() => copyUrl(buildICalUrl(), 'all')}
          />
        </div>
      )}
    </div>
  )
}

function CalendarSubRow({ label, webcalUrl, googleUrl, httpsUrl, copied, onCopy }: {
  label: string; webcalUrl: string; googleUrl: string; httpsUrl: string; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700 flex-1">{label}</span>
        <button onClick={onCopy} className="text-gray-400 hover:text-gray-700 shrink-0 p-1" title="iCal-URL kopieren">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <a href={webcalUrl} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded">
          <ExternalLink className="w-3 h-3" />Apple / Outlook
        </a>
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 hover:text-green-900 bg-green-50 px-2 py-1 rounded">
          <ExternalLink className="w-3 h-3" />Google Calendar
        </a>
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
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID, APP_URL } from '@/lib/config'
import { useTeams } from '@/lib/hooks/useTeams'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, Calendar, Check, ClipboardCopy, Loader2, MapPin,
  RefreshCw, ShieldAlert, TrendingUp,
} from 'lucide-react'
import type { Player } from '@/lib/types'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const STATUS_BADGE: Record<Player['status'], { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  active: { label: 'Aktiv', variant: 'success' },
  injured: { label: 'Verletzt', variant: 'warning' },
  inactive: { label: 'Inaktiv', variant: 'muted' },
}

interface AttendanceStats {
  total: number
  accepted: number
  declined: number
  noResponse: number
  acceptedPercent: number
  declinedPercent: number
  noResponsePercent: number
}

interface RecentEvent {
  id: string
  title: string
  type: string
  startDate: Date
  location?: string
  response: 'accepted' | 'declined' | null
}

function getCurrentSeason(): { label: string; start: Date } {
  const now = new Date()
  const year = now.getFullYear()
  if (now.getMonth() >= 6) return { label: `Herbst ${year}`, start: new Date(year, 6, 1) }
  return { label: `Frühjahr ${year}`, start: new Date(year, 0, 1) }
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { teams } = useTeams()

  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [plainToken, setPlainToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Stats
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  const season = getCurrentSeason()

  useEffect(() => {
    async function load() {
      const ref = doc(db, 'clubs', CLUB_ID, 'players', id)
      const snap = await getDoc(ref)
      if (snap.exists()) setPlayer({ id: snap.id, ...snap.data() } as Player)
      setLoading(false)
    }
    load()
  }, [id])

  // Load attendance stats
  useEffect(() => {
    if (!player) return

    async function loadStats() {
      try {
        const startTs = Timestamp.fromDate(season.start)
        const nowTs = Timestamp.now()

        // Get training events for this player's teams
        const teamIds = player!.teamIds
        if (teamIds.length === 0) { setStatsLoading(false); return }

        const eventsSnap = await getDocs(query(
          collection(db, 'clubs', CLUB_ID, 'events'),
          where('teamIds', 'array-contains-any', teamIds.slice(0, 10)),
          where('startDate', '>=', startTs),
          where('startDate', '<=', nowTs),
          orderBy('startDate', 'desc')
        ))

        const allEvents = eventsSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          startDate: (d.data().startDate as Timestamp).toDate(),
        }))

        // Get responses for each event
        let accepted = 0, declined = 0, noResponse = 0
        const recent: RecentEvent[] = []

        await Promise.all(allEvents.map(async event => {
          const respRef = doc(db, 'clubs', CLUB_ID, 'events', event.id, 'responses', player!.id)
          const respSnap = await getDoc(respRef)
          const status = respSnap.exists() ? (respSnap.data().status as 'accepted' | 'declined') : null

          if (status === 'accepted') accepted++
          else if (status === 'declined') declined++
          else noResponse++

          // Keep last 10 for timeline
          if (recent.length < 10) {
            recent.push({
              id: event.id,
              title: (event as Record<string, unknown>).title as string,
              type: (event as Record<string, unknown>).type as string,
              startDate: event.startDate,
              location: (event as Record<string, unknown>).location as string | undefined,
              response: status,
            })
          }
        }))

        const total = allEvents.length
        setAttendance({
          total,
          accepted,
          declined,
          noResponse,
          acceptedPercent: total > 0 ? Math.round((accepted / total) * 100) : 0,
          declinedPercent: total > 0 ? Math.round((declined / total) * 100) : 0,
          noResponsePercent: total > 0 ? Math.round((noResponse / total) * 100) : 0,
        })
        setRecentEvents(recent)
      } catch (err) {
        console.error('[PlayerProfile Stats]', err)
      } finally {
        setStatsLoading(false)
      }
    }

    loadStats()
  }, [player, season.start.getTime()])

  async function generateInviteToken() {
    if (!player) return
    setGeneratingToken(true)
    try {
      const token = crypto.randomUUID()
      const hash = await sha256(token)
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const ref = doc(db, 'clubs', CLUB_ID, 'players', player.id)
      await updateDoc(ref, {
        inviteToken: hash,
        inviteTokenExpiry: expiry,
        inviteTokenUsed: false,
        accountStatus: 'invited',
        updatedAt: serverTimestamp(),
      })
      setPlainToken(token)
      setPlayer(prev => prev ? { ...prev, inviteTokenUsed: false, accountStatus: 'invited' } : prev)
    } finally { setGeneratingToken(false) }
  }

  async function copyLink() {
    if (!plainToken) return
    await navigator.clipboard.writeText(`${APP_URL}/invite/${plainToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getTeamNames(teamIds: string[]) {
    return teamIds.map(id => teams.find(t => t.id === id)?.name).filter(Boolean).join(', ') || '–'
  }

  function getTeamColors(teamIds: string[]) {
    return teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean)
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>

  if (!player) return (
    <div className="text-center py-16 text-gray-500">
      <p>Spieler nicht gefunden.</p>
      <Button variant="ghost" onClick={() => router.back()} className="mt-4">Zurück</Button>
    </div>
  )

  const statusInfo = STATUS_BADGE[player.status]
  const inviteLink = plainToken ? `${APP_URL}/invite/${plainToken}` : null
  const isRegistered = player.accountStatus === 'active'
  const playerTeams = getTeamColors(player.teamIds)

  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Meeting', other: 'Termin' }

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Zurück zur Übersicht
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl shrink-0" style={{ backgroundColor: 'var(--club-primary, #1a1a2e)' }}>
            {player.firstName[0]}{player.lastName[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {player.firstName} {player.lastName}
              {player.jerseyNumber && <span className="ml-2 text-base font-normal text-gray-400">#{player.jerseyNumber}</span>}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {player.position && <span className="text-sm text-gray-500">{player.position}</span>}
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              {playerTeams.map(t => (
                <span key={t!.id} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t!.color }} />
                  {t!.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Stats — Spond-style */}
      <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Teilnahmestatistik
          </h2>
          <span className="text-xs text-gray-400">{season.label} · {attendance?.total ?? 0} Termine</span>
        </div>

        {statsLoading ? (
          <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : attendance && attendance.total > 0 ? (
          <div className="space-y-4">
            {/* Accepted bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-green-700">{attendance.acceptedPercent}%</span>
                <span className="text-xs text-gray-400">Angemeldet</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${attendance.acceptedPercent}%` }} />
              </div>
            </div>

            {/* Declined bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-red-600">{attendance.declinedPercent}%</span>
                <span className="text-xs text-gray-400">Abgemeldet</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${attendance.declinedPercent}%` }} />
              </div>
            </div>

            {/* No response bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-500">{attendance.noResponsePercent}%</span>
                <span className="text-xs text-gray-400">Keine Antwort</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gray-300 rounded-full transition-all" style={{ width: `${attendance.noResponsePercent}%` }} />
              </div>
            </div>

            {/* Summary */}
            <p className="text-xs text-gray-400 pt-2 border-t">
              {attendance.accepted} von {attendance.total} Terminen zugesagt · {attendance.noResponse} ohne Rückmeldung
            </p>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">Noch keine Statistikdaten in dieser Saison</p>
          </div>
        )}
      </div>

      {/* Recent Events Timeline */}
      {recentEvents.length > 0 && (
        <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
          <h2 className="text-sm font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Letzte Termine
          </h2>
          <div className="space-y-2">
            {recentEvents.map(event => {
              const dateStr = event.startDate.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
              const timeStr = event.startDate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={event.id} className="flex items-center gap-3 py-2">
                  {/* Status indicator */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    event.response === 'accepted' ? 'bg-green-500' :
                    event.response === 'declined' ? 'bg-red-500' : 'bg-gray-300'
                  }`} />

                  {/* Date */}
                  <span className="text-xs text-gray-400 w-16 shrink-0">{dateStr}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{event.title}</p>
                    <p className="text-xs text-gray-400">
                      {TYPE_LABELS[event.type] ?? 'Termin'} · {timeStr}
                      {event.location && ` · ${event.location}`}
                    </p>
                  </div>

                  {/* Response badge */}
                  <Badge
                    variant={event.response === 'accepted' ? 'success' : event.response === 'declined' ? 'destructive' : 'muted'}
                    className="text-[10px] shrink-0"
                  >
                    {event.response === 'accepted' ? 'Zugesagt' : event.response === 'declined' ? 'Abgesagt' : 'Offen'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Contact & Details */}
      <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
        <h2 className="text-sm font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Kontakt & Details
        </h2>
        <div className="space-y-3">
          <InfoRow label="E-Mail" value={player.email} />
          <InfoRow label="Telefon" value={player.phone ?? '–'} />
          <InfoRow label="Geburtsdatum" value={player.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString('de-AT') : '–'} />
          <InfoRow label="Teams" value={getTeamNames(player.teamIds)} />
        </div>
      </div>

      {/* App-Zugang */}
      <div className="bg-white rounded-lg border p-6" style={{ borderRadius: '8px' }}>
        <h2 className="text-sm font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>App-Zugang</h2>
        <p className="text-xs text-gray-400 mb-4">
          {isRegistered ? 'Spieler hat sich bereits registriert.' :
           player.accountStatus === 'invited' ? 'Einladung wurde gesendet – noch nicht registriert.' :
           'Noch kein Einladungslink generiert.'}
        </p>

        {isRegistered ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">
            <Check className="w-4 h-4" />Registriert
          </div>
        ) : (
          <>
            <Button onClick={generateInviteToken} disabled={generatingToken} variant="outline" className="mb-4">
              {generatingToken ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {player.accountStatus === 'invited' ? 'Link neu generieren' : 'Einladungslink generieren'}
            </Button>
            {inviteLink && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2 border">
                  <code className="text-xs text-gray-600 flex-1 truncate">{inviteLink}</code>
                  <button onClick={copyLink} className="text-gray-400 hover:text-gray-700 shrink-0" title="Link kopieren">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Dieser Link ist <strong>24 Stunden gültig</strong> und kann nur <strong>einmal verwendet</strong> werden.</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}
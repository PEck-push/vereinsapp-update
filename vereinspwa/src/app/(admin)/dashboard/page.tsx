'use client'

import { useMemo, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useTeams } from '@/lib/hooks/useTeams'
import { useEvents } from '@/lib/hooks/useEvents'
import { useAdminProfile } from '@/lib/hooks/useAdminProfile'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle, ArrowDownRight, Bell, CalendarDays, Loader2, MapPin,
  ShieldAlert, TrendingUp, Trophy, UserCheck, Users,
} from 'lucide-react'
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { ClubEvent, Player, Team } from '@/lib/types'

function toDate(d: unknown): Date {
  if (d instanceof Timestamp) return d.toDate()
  if (d instanceof Date) return d
  if (d && typeof d === 'object' && 'seconds' in d) {
    return new Date((d as { seconds: number }).seconds * 1000)
  }
  return new Date(d as string)
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function getCurrentSeason(): { label: string; start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  if (month >= 6) {
    return { label: `Herbst ${year}`, start: new Date(year, 6, 1), end: new Date(year, 11, 31) }
  } else {
    return { label: `Frühjahr ${year}`, start: new Date(year, 0, 1), end: new Date(year, 5, 30) }
  }
}

export default function DashboardPage() {
  const { state: adminState, profile, isAllTeams } = useAdminProfile()
  const { players, loading: playersLoading } = usePlayers()
  const { teams, loading: teamsLoading } = useTeams()
  const { events, loading: eventsLoading } = useEvents()

  const loading = playersLoading || teamsLoading || eventsLoading || adminState.status === 'loading'

  const myTeamIds = useMemo(() => {
    if (isAllTeams) return teams.map(t => t.id)
    return profile?.teamIds ?? []
  }, [isAllTeams, profile, teams])

  const myTeams = useMemo(() => isAllTeams ? teams : teams.filter(t => myTeamIds.includes(t.id)), [teams, myTeamIds, isAllTeams])

  // Count ALL players (including those without teamIds) for admin/secretary
  const myPlayers = useMemo(
    () => players.filter(p => {
      if (p.status === 'inactive') return false
      if (isAllTeams) return true
      return p.teamIds && p.teamIds.some(id => myTeamIds.includes(id))
    }),
    [players, myTeamIds, isAllTeams]
  )

  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  // FIX: Use start of today for comparison so today's events ALWAYS show
  const todayStart = useMemo(() => startOfDay(new Date()), [])

  // All events relevant to this user's teams (no date filter)
  const myEvents = useMemo(() => {
    return events.filter(e => isAllTeams || e.teamIds.some(id => myTeamIds.includes(id)))
  }, [events, myTeamIds, isAllTeams])

  // Upcoming events: from today onwards (including all of today), next 14 days
  const myUpcomingEvents = useMemo(() => {
    const twoWeeksLater = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000)
    return myEvents
      .filter(e => {
        const d = toDate(e.startDate)
        return d >= todayStart && d <= twoWeeksLater
      })
      .sort((a, b) => toDate(a.startDate).getTime() - toDate(b.startDate).getTime())
  }, [myEvents, todayStart])

  // This week's events (for week strip) — use ALL events, not just upcoming
  const thisWeekEvents = useMemo(() => {
    const monday = getMonday(new Date())
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return myEvents.filter(e => {
      const d = toDate(e.startDate)
      return d >= monday && d <= sunday
    })
  }, [myEvents])

  const eventPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const event of myUpcomingEvents) {
      counts[event.id] = myPlayers.filter(p => p.teamIds && p.teamIds.some(id => event.teamIds.includes(id))).length
    }
    return counts
  }, [myUpcomingEvents, myPlayers])

  const injuredCount = myPlayers.filter(p => p.status === 'injured').length
  // FIX: Only count as "no access" if accountStatus is explicitly 'invited' — don't count missing field
  const noAccountCount = myPlayers.filter(p => p.accountStatus === 'invited').length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{greeting}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {!isAllTeams && myTeams.length > 0 && <span className="ml-2">· {myTeams.map(t => t.name).join(', ')}</span>}
        </p>
      </div>

      {/* Zone 1: Nächste Termine */}
      <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Kommende Termine</h2>
          <Link href="/events" className="text-xs text-gray-400 hover:text-gray-700">Alle anzeigen</Link>
        </div>
        {myUpcomingEvents.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CalendarDays className="w-7 h-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Keine Termine in den nächsten 2 Wochen</p>
            <p className="text-xs text-gray-300 mt-1">{events.length} Termine insgesamt geladen · {myEvents.length} für deine Teams</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myUpcomingEvents.slice(0, 6).map(event => (
              <EventRow key={event.id} event={event} totalPlayers={eventPlayerCounts[event.id] ?? 0} teamMap={teamMap} />
            ))}
          </div>
        )}
      </div>

      {/* Zone 2: Wochenleiste */}
      <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Diese Woche</h2>
          <Link href="/calendar" className="text-xs text-gray-400 hover:text-gray-700">Kalender öffnen</Link>
        </div>
        <WeekStrip events={thisWeekEvents} teamMap={teamMap} />
      </div>

      {/* Zone 3: Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Aktive Spieler" value={myPlayers.length} icon={Users} color="var(--club-primary, #1a1a2e)" />
        <StatCard label="Mannschaften" value={myTeams.length} icon={UserCheck} color="#0F6E56" />
        <StatCard label="Verletzt" value={injuredCount} icon={ShieldAlert} color={injuredCount > 0 ? '#DC2626' : '#6B7280'} alert={injuredCount > 0} />
        <StatCard label="Ohne App-Zugang" value={noAccountCount} icon={AlertCircle} color={noAccountCount > 0 ? '#F59E0B' : '#6B7280'} alert={noAccountCount > 0} href="/players" />
      </div>

      {/* Zone 4: Trainingskaiser + Trainingsmuffel */}
      <TrainingLeaderboard players={myPlayers} myTeamIds={myTeamIds} isAllTeams={isAllTeams} />

      {/* Zone 5: Offene Rückmeldungen */}
      <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Offene Rückmeldungen</h2>
        </div>
        <PendingList events={myUpcomingEvents} playerCounts={eventPlayerCounts} teamMap={teamMap} />
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, alert, href }: {
  label: string; value: number; icon: React.ElementType; color: string; alert?: boolean; href?: string
}) {
  const content = (
    <div className={`bg-white rounded-lg border p-4 ${href ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`} style={{ borderRadius: '8px' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}12` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {alert && <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color }} />}
      </div>
      <p className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

// ─── Event Row ────────────────────────────────────────────────────────────────
function EventRow({ event, totalPlayers, teamMap }: { event: ClubEvent; totalPlayers: number; teamMap: Map<string, Team> }) {
  const date = toDate(event.startDate)
  const accepted = event.responseCount?.accepted ?? 0
  const percent = totalPlayers > 0 ? Math.round((accepted / totalPlayers) * 100) : 0
  const barColor = percent >= 75 ? '#10B981' : percent >= 40 ? '#F59E0B' : '#EF4444'
  const firstTeam = event.teamIds.length > 0 ? teamMap.get(event.teamIds[0]) : null
  const teamColor = firstTeam?.color ?? '#F59E0B'
  const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Meeting', other: 'Termin' }
  const today = new Date()
  const isToday = isSameDay(date, today)
  const isTomorrow = isSameDay(date, new Date(Date.now() + 86400000))
  const dayLabel = isToday ? 'Heute' : isTomorrow ? 'Morgen' : date.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Link href="/events" className="flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow">
      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{TYPE_LABELS[event.type] ?? 'Termin'}</span>
          {isToday && <Badge variant="destructive" className="text-[10px] bg-red-100 text-red-700 border-0">Heute</Badge>}
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
        <p className="text-xs text-gray-400">{dayLabel} · {date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}{event.location && ` · ${event.location}`}</p>
      </div>
      <div className="shrink-0 w-20 text-right">
        <p className="text-sm font-semibold" style={{ color: barColor }}>{accepted}/{totalPlayers}</p>
        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: barColor }} />
        </div>
      </div>
    </Link>
  )
}

// ─── Pending List ─────────────────────────────────────────────────────────────
function PendingList({ events, playerCounts, teamMap }: { events: ClubEvent[]; playerCounts: Record<string, number>; teamMap: Map<string, Team> }) {
  const withPending = events
    .map(e => ({ event: e, pending: Math.max(0, (playerCounts[e.id] ?? 0) - (e.responseCount?.total ?? 0)), total: playerCounts[e.id] ?? 0 }))
    .filter(e => e.pending > 0)
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5)

  if (withPending.length === 0) {
    return <div className="text-center py-8 text-gray-400"><TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" /><p className="text-xs">Alle haben geantwortet</p></div>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {withPending.map(({ event, pending, total }) => {
        const firstTeam = event.teamIds.length > 0 ? teamMap.get(event.teamIds[0]) : null
        return (
          <div key={event.id} className="p-3 rounded-lg bg-gray-50 space-y-2">
            <div className="flex items-center gap-2">
              {firstTeam && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: firstTeam.color }} />}
              <p className="text-xs font-medium text-gray-800 truncate flex-1">{event.title}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500"><span className="font-semibold text-amber-600">{pending}</span> von {total} offen</span>
              <Link href="/events" className="text-[10px] font-medium px-2 py-1 rounded-md text-white" style={{ backgroundColor: 'var(--club-secondary, #e94560)' }}>Details</Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Training Leaderboard ─────────────────────────────────────────────────────
interface PlayerAttendance { player: Player; attended: number; total: number; noResponse: number; quote: number }

function TrainingLeaderboard({ players, myTeamIds, isAllTeams }: { players: Player[]; myTeamIds: string[]; isAllTeams: boolean }) {
  const [stats, setStats] = useState<PlayerAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const season = getCurrentSeason()

  useEffect(() => {
    async function load() {
      try {
        const startTs = Timestamp.fromDate(season.start)
        const nowTs = Timestamp.now()
        const allEvents: { id: string; teamIds: string[] }[] = []

        for (let i = 0; i < myTeamIds.length; i += 10) {
          const batch = myTeamIds.slice(i, i + 10)
          if (batch.length === 0) continue
          const snap = await getDocs(query(
            collection(db, 'clubs', CLUB_ID, 'events'),
            where('teamIds', 'array-contains-any', batch),
            where('type', '==', 'training'),
            where('startDate', '>=', startTs),
            where('startDate', '<=', nowTs),
            orderBy('startDate', 'asc')
          ))
          snap.docs.forEach(d => {
            if (!allEvents.find(e => e.id === d.id)) allEvents.push({ id: d.id, teamIds: d.data().teamIds ?? [] })
          })
        }

        if (allEvents.length === 0) { setStats([]); setLoading(false); return }

        const responsesByEvent: Record<string, Record<string, string>> = {}
        await Promise.all(allEvents.map(async event => {
          const snap = await getDocs(collection(db, 'clubs', CLUB_ID, 'events', event.id, 'responses'))
          const map: Record<string, string> = {}
          snap.docs.forEach(d => { map[d.id] = d.data().status })
          responsesByEvent[event.id] = map
        }))

        const playerStats: PlayerAttendance[] = players.map(player => {
          const relevantEvents = allEvents.filter(e => e.teamIds.some(tid => player.teamIds?.includes(tid)))
          const total = relevantEvents.length
          let attended = 0, noResponse = 0
          for (const event of relevantEvents) {
            const response = responsesByEvent[event.id]?.[player.id]
            if (response === 'accepted') attended++
            else if (!response) noResponse++
          }
          return { player, attended, total, noResponse, quote: total > 0 ? Math.round((attended / total) * 100) : 0 }
        }).filter(s => s.total > 0)

        playerStats.sort((a, b) => b.quote - a.quote)
        setStats(playerStats)
      } catch (err) { console.error('[TrainingLeaderboard]', err) }
      finally { setLoading(false) }
    }
    if (myTeamIds.length > 0) load()
    else setLoading(false)
  }, [players, myTeamIds, isAllTeams, season.start.getTime()])

  const top3 = stats.slice(0, 3)
  const bottom3 = stats.filter(s => s.total >= 3).slice(-3).reverse()

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Skeleton className="h-56 rounded-lg" /><Skeleton className="h-56 rounded-lg" /></div>
  if (stats.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
        <div className="flex items-center gap-2 mb-1"><Trophy className="w-4 h-4 text-amber-500" /><h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Trainingskaiser</h2></div>
        <p className="text-xs text-gray-400 mb-4">{season.label} · höchste Beteiligung</p>
        <div className="space-y-3">
          {top3.map((s, i) => (
            <Link key={s.player.id} href={`/players/${s.player.id}`} className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : '#B45309', color: '#fff' }}>{i + 1}</div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ backgroundColor: 'var(--club-primary, #1a1a2e)' }}>{s.player.firstName[0]}{s.player.lastName[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.player.firstName} {s.player.lastName}</p>
                <p className="text-xs text-gray-400">{s.attended} von {s.total} Trainings</p>
              </div>
              <p className="text-lg font-bold shrink-0" style={{ color: '#10B981', fontFamily: 'Outfit, sans-serif' }}>{s.quote}%</p>
            </Link>
          ))}
        </div>
        <Link href="/stats/training" className="block text-center text-xs text-gray-400 hover:text-gray-700 mt-4 pt-3 border-t">Alle Statistiken anzeigen</Link>
      </div>

      <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
        <div className="flex items-center gap-2 mb-1"><ArrowDownRight className="w-4 h-4 text-red-400" /><h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>Trainingsmuffel</h2></div>
        <p className="text-xs text-gray-400 mb-4">{season.label} · niedrigste Beteiligung</p>
        {bottom3.length === 0 ? (
          <div className="text-center py-6 text-gray-400"><p className="text-xs">Zu wenig Daten (min. 3 Trainings nötig)</p></div>
        ) : (
          <div className="space-y-3">
            {bottom3.map(s => (
              <Link key={s.player.id} href={`/players/${s.player.id}`} className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ backgroundColor: '#6B7280' }}>{s.player.firstName[0]}{s.player.lastName[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.player.firstName} {s.player.lastName}</p>
                  <p className="text-xs text-gray-400">{s.attended} von {s.total} Trainings{s.noResponse > 0 && <span className="text-amber-500"> · {s.noResponse}× keine Antwort</span>}</p>
                </div>
                <p className="text-lg font-bold shrink-0" style={{ color: s.quote < 30 ? '#EF4444' : '#F59E0B', fontFamily: 'Outfit, sans-serif' }}>{s.quote}%</p>
              </Link>
            ))}
          </div>
        )}
        <Link href="/stats/training" className="block text-center text-xs text-gray-400 hover:text-gray-700 mt-4 pt-3 border-t">Alle Statistiken anzeigen</Link>
      </div>
    </div>
  )
}

// ─── Week Strip ───────────────────────────────────────────────────────────────
function WeekStrip({ events, teamMap }: { events: ClubEvent[]; teamMap: Map<string, Team> }) {
  const today = new Date()
  const monday = getMonday(today)
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d })

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day, i) => {
        const isToday = isSameDay(day, today)
        const dayEvents = events.filter(e => isSameDay(toDate(e.startDate), day))
        return (
          <div key={i} className="text-center">
            <p className={`text-xs font-medium mb-2 ${isToday ? 'text-[var(--club-secondary,#e94560)]' : 'text-gray-400'}`}>{WEEKDAYS[i]}</p>
            <p className={`text-sm font-semibold mb-2 w-7 h-7 rounded-full inline-flex items-center justify-center ${isToday ? 'text-white' : 'text-gray-700'}`}
              style={isToday ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}>
              {day.getDate()}
            </p>
            <div className="space-y-1 min-h-[28px]">
              {dayEvents.slice(0, 3).map(ev => {
                const ft = ev.teamIds.length > 0 ? teamMap.get(ev.teamIds[0]) : null
                const color = ft?.color ?? '#F59E0B'
                const label = ft?.name ? (ft.name.length > 6 ? ft.name.slice(0, 5) + '…' : ft.name) : 'Event'
                return <div key={ev.id} className="text-[10px] font-medium px-1 py-0.5 rounded truncate" style={{ backgroundColor: `${color}18`, color }} title={ev.title}>{label}</div>
              })}
              {dayEvents.length > 3 && <p className="text-[10px] text-gray-400">+{dayEvents.length - 3}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div><Skeleton className="h-8 w-64 mb-1" /><Skeleton className="h-4 w-48" /></div>
      <Skeleton className="h-80 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Skeleton className="h-56 rounded-lg" /><Skeleton className="h-56 rounded-lg" /></div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  )
}
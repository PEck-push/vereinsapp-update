'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useTeams } from '@/lib/hooks/useTeams'
import { useEvents } from '@/lib/hooks/useEvents'
import { useAdminProfile } from '@/lib/hooks/useAdminProfile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Loader2,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { ClubEvent, Player, Team } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(d: unknown): Date {
  if (d instanceof Timestamp) return d.toDate()
  if (d instanceof Date) return d
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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { state: adminState, profile, isAllTeams } = useAdminProfile()
  const { players, loading: playersLoading } = usePlayers()
  const { teams, loading: teamsLoading } = useTeams()
  const { events, loading: eventsLoading } = useEvents()

  const loading = playersLoading || teamsLoading || eventsLoading || adminState.status === 'loading'

  // Filter by trainer's teams if not admin
  const myTeamIds = useMemo(() => {
    if (isAllTeams) return teams.map((t) => t.id)
    return profile?.teamIds ?? []
  }, [isAllTeams, profile, teams])

  const myTeams = useMemo(
    () => (isAllTeams ? teams : teams.filter((t) => myTeamIds.includes(t.id))),
    [teams, myTeamIds, isAllTeams]
  )

  const myPlayers = useMemo(
    () =>
      players.filter(
        (p) =>
          p.status !== 'inactive' &&
          (isAllTeams || p.teamIds.some((id) => myTeamIds.includes(id)))
      ),
    [players, myTeamIds, isAllTeams]
  )

  const now = new Date()

  const myUpcomingEvents = useMemo(() => {
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    return events
      .filter((e) => {
        const d = toDate(e.startDate)
        if (d < now || d > twoWeeksLater) return false
        if (isAllTeams) return true
        return e.teamIds.some((id) => myTeamIds.includes(id))
      })
      .sort((a, b) => toDate(a.startDate).getTime() - toDate(b.startDate).getTime())
  }, [events, now, myTeamIds, isAllTeams])

  // Player count per event (how many players are in the event's teams)
  const eventPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const event of myUpcomingEvents) {
      const count = myPlayers.filter((p) =>
        p.teamIds.some((id) => event.teamIds.includes(id))
      ).length
      counts[event.id] = count
    }
    return counts
  }, [myUpcomingEvents, myPlayers])

  // Team map for color lookups
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

  // Quick stats
  const injuredCount = myPlayers.filter((p) => p.status === 'injured').length
  const noAccountCount = myPlayers.filter(
    (p) => p.accountStatus === 'invited' || !p.accountStatus
  ).length

  // Greeting
  const hour = now.getHours()
  const greeting =
    hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const roleName = profile?.role === 'trainer' ? 'Trainer' : ''

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold text-gray-900"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {greeting}{roleName ? `, ${roleName}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {now.toLocaleDateString('de-AT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {!isAllTeams && myTeams.length > 0 && (
            <span className="ml-2">
              ·{' '}
              {myTeams.map((t) => t.name).join(', ')}
            </span>
          )}
        </p>
      </div>

      {/* Zone 1: Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Aktive Spieler"
          value={myPlayers.length}
          icon={Users}
          color="#1a1a2e"
        />
        <StatCard
          label="Mannschaften"
          value={myTeams.length}
          icon={UserCheck}
          color="#0F6E56"
        />
        <StatCard
          label="Verletzt"
          value={injuredCount}
          icon={ShieldAlert}
          color={injuredCount > 0 ? '#DC2626' : '#6B7280'}
          alert={injuredCount > 0}
        />
        <StatCard
          label="Ohne App-Zugang"
          value={noAccountCount}
          icon={AlertCircle}
          color={noAccountCount > 0 ? '#F59E0B' : '#6B7280'}
          alert={noAccountCount > 0}
          href="/players"
        />
      </div>

      {/* Zone 2: Events + Pending */}
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Left: Next Events */}
        <div
          className="flex-1 bg-white rounded-lg border p-5"
          style={{ borderRadius: '8px' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-sm font-semibold text-gray-700"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Kommende Termine
            </h2>
            <Link
              href="/events"
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Alle anzeigen
            </Link>
          </div>

          {myUpcomingEvents.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <CalendarDays className="w-7 h-7 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Keine Termine in den nächsten 2 Wochen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myUpcomingEvents.slice(0, 6).map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  totalPlayers={eventPlayerCounts[event.id] ?? 0}
                  teamMap={teamMap}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Pending Responses */}
        <div
          className="lg:w-72 shrink-0 bg-white rounded-lg border p-5"
          style={{ borderRadius: '8px' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-gray-400" />
            <h2
              className="text-sm font-semibold text-gray-700"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Offene Rückmeldungen
            </h2>
          </div>

          <PendingList
            events={myUpcomingEvents}
            playerCounts={eventPlayerCounts}
            teamMap={teamMap}
          />
        </div>
      </div>

      {/* Zone 3: Week Strip */}
      <div
        className="bg-white rounded-lg border p-5"
        style={{ borderRadius: '8px' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold text-gray-700"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Diese Woche
          </h2>
          <Link
            href="/calendar"
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            Kalender öffnen
          </Link>
        </div>
        <WeekStrip events={myUpcomingEvents} teamMap={teamMap} />
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  alert,
  href,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  alert?: boolean
  href?: string
}) {
  const content = (
    <div
      className={`bg-white rounded-lg border p-4 ${href ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}
      style={{ borderRadius: '8px' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}12` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {alert && (
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: color }}
          />
        )}
      </div>
      <p
        className="text-2xl font-bold"
        style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )

  if (href) return <Link href={href}>{content}</Link>
  return content
}

// ─── Event Row with Progress Bar ──────────────────────────────────────────────

function EventRow({
  event,
  totalPlayers,
  teamMap,
}: {
  event: ClubEvent
  totalPlayers: number
  teamMap: Map<string, Team>
}) {
  const date = toDate(event.startDate)
  const accepted = event.responseCount?.accepted ?? 0
  const total = totalPlayers
  const percent = total > 0 ? Math.round((accepted / total) * 100) : 0

  const barColor =
    percent >= 75 ? '#10B981' : percent >= 40 ? '#F59E0B' : '#EF4444'

  const firstTeam = event.teamIds.length > 0 ? teamMap.get(event.teamIds[0]) : null
  const teamColor = firstTeam?.color ?? '#F59E0B'

  const TYPE_LABELS: Record<string, string> = {
    training: 'Training',
    match: 'Spiel',
    meeting: 'Meeting',
    other: 'Termin',
  }

  const isToday = isSameDay(date, new Date())
  const isTomorrow = isSameDay(
    date,
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  )
  const dayLabel = isToday
    ? 'Heute'
    : isTomorrow
    ? 'Morgen'
    : date.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Link
      href="/events"
      className="flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow"
    >
      {/* Team color bar */}
      <div
        className="w-1 h-10 rounded-full shrink-0"
        style={{ backgroundColor: teamColor }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {TYPE_LABELS[event.type] ?? 'Termin'}
          </span>
          {isToday && (
            <Badge
              variant="destructive"
              className="text-[10px] bg-red-100 text-red-700 border-0"
            >
              Heute
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">
          {event.title}
        </p>
        <p className="text-xs text-gray-400">
          {dayLabel} · {date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}
          {event.location && ` · ${event.location}`}
        </p>
      </div>

      {/* Progress */}
      <div className="shrink-0 w-20 text-right">
        <p className="text-sm font-semibold" style={{ color: barColor }}>
          {accepted}/{total}
        </p>
        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(percent, 100)}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      </div>
    </Link>
  )
}

// ─── Pending Responses List ───────────────────────────────────────────────────

function PendingList({
  events,
  playerCounts,
  teamMap,
}: {
  events: ClubEvent[]
  playerCounts: Record<string, number>
  teamMap: Map<string, Team>
}) {
  // Sort by most pending first
  const withPending = events
    .map((e) => {
      const total = playerCounts[e.id] ?? 0
      const responded = e.responseCount?.total ?? 0
      const pending = Math.max(0, total - responded)
      return { event: e, pending, total }
    })
    .filter((e) => e.pending > 0)
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5)

  if (withPending.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
        <p className="text-xs">Alle haben geantwortet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {withPending.map(({ event, pending, total }) => {
        const firstTeam =
          event.teamIds.length > 0 ? teamMap.get(event.teamIds[0]) : null

        return (
          <div
            key={event.id}
            className="p-3 rounded-lg bg-gray-50 space-y-2"
          >
            <div className="flex items-center gap-2">
              {firstTeam && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: firstTeam.color }}
                />
              )}
              <p className="text-xs font-medium text-gray-800 truncate flex-1">
                {event.title}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-amber-600">{pending}</span>{' '}
                von {total} offen
              </span>
              <Link
                href="/events"
                className="text-[10px] font-medium px-2 py-1 rounded-md text-white"
                style={{ backgroundColor: '#e94560' }}
              >
                Details
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Week Strip ───────────────────────────────────────────────────────────────

function WeekStrip({
  events,
  teamMap,
}: {
  events: ClubEvent[]
  teamMap: Map<string, Team>
}) {
  const today = new Date()
  const monday = getMonday(today)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day, i) => {
        const isToday = isSameDay(day, today)
        const dayEvents = events.filter((e) => isSameDay(toDate(e.startDate), day))

        return (
          <div key={i} className="text-center">
            {/* Day Header */}
            <p
              className={`text-xs font-medium mb-2 ${
                isToday ? 'text-[#e94560]' : 'text-gray-400'
              }`}
            >
              {WEEKDAYS[i]}
            </p>
            <p
              className={`text-sm font-semibold mb-2 w-7 h-7 rounded-full inline-flex items-center justify-center ${
                isToday ? 'text-white' : 'text-gray-700'
              }`}
              style={isToday ? { backgroundColor: '#e94560' } : {}}
            >
              {day.getDate()}
            </p>

            {/* Event blocks */}
            <div className="space-y-1 min-h-[28px]">
              {dayEvents.slice(0, 3).map((ev) => {
                const firstTeam =
                  ev.teamIds.length > 0 ? teamMap.get(ev.teamIds[0]) : null
                const color = firstTeam?.color ?? '#F59E0B'
                const label =
                  firstTeam?.name
                    ? firstTeam.name.length > 6
                      ? firstTeam.name.slice(0, 5) + '…'
                      : firstTeam.name
                    : 'Event'

                return (
                  <div
                    key={ev.id}
                    className="text-[10px] font-medium px-1 py-0.5 rounded truncate"
                    style={{
                      backgroundColor: `${color}18`,
                      color: color,
                    }}
                    title={ev.title}
                  >
                    {label}
                  </div>
                )
              })}
              {dayEvents.length > 3 && (
                <p className="text-[10px] text-gray-400">
                  +{dayEvents.length - 3}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-1" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="flex gap-4 flex-col lg:flex-row">
        <Skeleton className="flex-1 h-80 rounded-lg" />
        <Skeleton className="lg:w-72 h-80 rounded-lg" />
      </div>
      <Skeleton className="h-40 rounded-lg" />
    </div>
  )
}

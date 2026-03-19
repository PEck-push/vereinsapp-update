'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ClubEvent, EventResponse, MatchStat } from '@/lib/types'

interface PlayerStatsTabsProps {
  playerId: string
  teamIds: string[]
}

export function PlayerStatsTabs({ playerId, teamIds }: PlayerStatsTabsProps) {
  return (
    <Tabs defaultValue="training" className="mt-4">
      <TabsList className="w-full">
        <TabsTrigger value="training" className="flex-1">Training</TabsTrigger>
        <TabsTrigger value="games" className="flex-1">Spiele</TabsTrigger>
      </TabsList>
      <TabsContent value="training">
        <TrainingTab playerId={playerId} teamIds={teamIds} />
      </TabsContent>
      <TabsContent value="games">
        <GamesTab playerId={playerId} teamIds={teamIds} />
      </TabsContent>
    </Tabs>
  )
}

// ─── Training Tab ─────────────────────────────────────────────────────────────
function TrainingTab({ playerId, teamIds }: { playerId: string; teamIds: string[] }) {
  const [loading, setLoading] = useState(true)
  const [monthlyData, setMonthlyData] = useState<{ month: string; attended: number; total: number }[]>([])
  const [totals, setTotals] = useState({ attended: 0, total: 0 })

  useEffect(() => {
    if (teamIds.length === 0) { setLoading(false); return }

    async function load() {
      try {
        const sixMonthsAgo = new Date(Date.now() - 24 * 7 * 24 * 60 * 60 * 1000)
        const cutoffTs = Timestamp.fromDate(sixMonthsAgo)

        // Load training events for player's teams
        const eventsSnap = await getDocs(
          query(
            collection(db, 'clubs', CLUB_ID, 'events'),
            where('teamIds', 'array-contains-any', teamIds.slice(0, 10)),
            where('type', '==', 'training'),
            where('startDate', '>=', cutoffTs),
            where('startDate', '<=', Timestamp.now())
          )
        )

        const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClubEvent)

        // Load this player's responses
        const responsesByEvent: Record<string, 'accepted' | 'declined' | null> = {}
        await Promise.all(events.map(async (event) => {
          const respSnap = await getDocs(
            query(
              collection(db, 'clubs', CLUB_ID, 'events', event.id, 'responses'),
              where('playerId', '==', playerId)
            )
          )
          if (!respSnap.empty) {
            responsesByEvent[event.id] = respSnap.docs[0].data().status
          } else {
            responsesByEvent[event.id] = null
          }
        }))

        // Group by month (last 6 months)
        const monthMap: Record<string, { attended: number; total: number }> = {}
        for (const event of events) {
          const d = event.startDate instanceof Timestamp
            ? event.startDate.toDate()
            : new Date(event.startDate as unknown as string)
          const key = d.toLocaleDateString('de-AT', { month: 'short', year: '2-digit' })
          if (!monthMap[key]) monthMap[key] = { attended: 0, total: 0 }
          monthMap[key].total++
          if (responsesByEvent[event.id] === 'accepted') monthMap[key].attended++
        }

        const monthly = Object.entries(monthMap).map(([month, v]) => ({ month, ...v }))
        setMonthlyData(monthly)

        const attended = Object.values(responsesByEvent).filter(v => v === 'accepted').length
        setTotals({ attended, total: events.length })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [playerId, teamIds.join(',')])

  if (loading) {
    return <div className="space-y-3 mt-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 rounded-lg" /></div>
  }

  const quote = totals.total === 0 ? 0 : Math.round((totals.attended / totals.total) * 100)

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-3xl font-bold" style={{ color: '#1a1a2e', fontFamily: 'Outfit, sans-serif' }}>{quote}%</p>
          <p className="text-xs text-gray-400">Beteiligungsquote</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">{totals.attended} von {totals.total}</p>
          <p className="text-xs text-gray-400">Trainings besucht</p>
        </div>
      </div>

      {monthlyData.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Anwesenheit letzte Monate</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any, _: any, props: any) => [`${v}/${props.payload.total}`, 'Anwesend']} />
              <Bar dataKey="attended" fill="#1a1a2e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Games Tab ────────────────────────────────────────────────────────────────
function GamesTab({ playerId, teamIds }: { playerId: string; teamIds: string[] }) {
  const [loading, setLoading] = useState(true)
  const [gameLog, setGameLog] = useState<{
    date: Date
    opponent: string
    result: { goalsFor: number; goalsAgainst: number }
    minutesPlayed: number
    goals: number
    assists: number
    homeOrAway: 'home' | 'away'
    isStarter: boolean
  }[]>([])
  const [totals, setTotals] = useState({ games: 0, starters: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0 })

  useEffect(() => {
    if (teamIds.length === 0) { setLoading(false); return }

    async function load() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'clubs', CLUB_ID, 'matchStats'),
            where('teamId', 'in', teamIds.slice(0, 10))
          )
        )

        const log: typeof gameLog = []
        let t = { games: 0, starters: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0 }

        for (const d of snap.docs) {
          const stat = { id: d.id, ...d.data() } as MatchStat
          const pm = stat.playerMinutes.find(p => p.playerId === playerId)
          if (!pm) continue

          const mp = pm.minuteOut - pm.minuteIn
          t.games++
          t.minutes += mp
          t.goals += pm.goals
          t.assists += pm.assists
          t.yellow += pm.yellowCards
          if (pm.redCard) t.red++
          if (pm.isStarter) t.starters++

          // Get event date from matchStats createdAt as fallback
          const createdAt = stat.createdAt instanceof Timestamp
            ? stat.createdAt.toDate()
            : new Date(stat.createdAt as unknown as string)

          log.push({
            date: createdAt,
            opponent: stat.opponent,
            result: stat.result,
            minutesPlayed: mp,
            goals: pm.goals,
            assists: pm.assists,
            homeOrAway: stat.homeOrAway,
            isStarter: pm.isStarter,
          })
        }

        log.sort((a, b) => b.date.getTime() - a.date.getTime())
        setGameLog(log.slice(0, 10))
        setTotals(t)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [playerId, teamIds.join(',')])

  if (loading) {
    return <div className="space-y-3 mt-4"><Skeleton className="h-24 rounded-lg" /><Skeleton className="h-40 rounded-lg" /></div>
  }

  if (totals.games === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Noch keine Spieleinsätze.</p>
  }

  return (
    <div className="mt-4 space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Spiele', value: totals.games },
          { label: 'Minuten', value: totals.minutes },
          { label: '⚽ Tore', value: totals.goals },
          { label: '🅰 Assists', value: totals.assists },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold" style={{ color: '#1a1a2e', fontFamily: 'Outfit, sans-serif' }}>{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      {(totals.yellow > 0 || totals.red > 0) && (
        <div className="flex gap-2">
          {totals.yellow > 0 && <Badge variant="warning">🟨 {totals.yellow} Gelb</Badge>}
          {totals.red > 0 && <Badge variant="destructive">🟥 {totals.red} Rot</Badge>}
        </div>
      )}

      {/* Game Log */}
      <div className="border rounded-lg overflow-hidden">
        <p className="text-xs font-medium text-gray-500 px-4 py-2 bg-gray-50 border-b">Letzte Spiele</p>
        <div className="divide-y">
          {gameLog.map((g, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-xs text-gray-400 w-16 shrink-0">
                {g.date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
              </span>
              <span className="flex-1 font-medium text-gray-800 truncate">
                {g.homeOrAway === 'home' ? 'vs.' : '@'} {g.opponent}
              </span>
              <span className="text-xs text-gray-500">
                {g.result.goalsFor}:{g.result.goalsAgainst}
              </span>
              <span className="text-xs text-gray-400 w-14 text-right">
                {g.minutesPlayed}&apos;
                {g.isStarter ? '' : <span className="text-blue-400"> ↑</span>}
              </span>
              {(g.goals > 0 || g.assists > 0) && (
                <span className="text-xs text-gray-500">
                  {g.goals > 0 ? `⚽${g.goals}` : ''}{g.assists > 0 ? ` 🅰${g.assists}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
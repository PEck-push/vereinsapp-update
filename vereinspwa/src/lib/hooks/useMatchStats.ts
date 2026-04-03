import { useEffect, useState } from 'react'
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import type { ClubEvent, EventResponse, MatchStat, Player, PlayerMinutes } from '@/lib/types'

function eventsRef() { return collection(db, 'clubs', CLUB_ID, 'events') }
function responsesRef(eventId: string) { return collection(db, 'clubs', CLUB_ID, 'events', eventId, 'responses') }
function matchStatsRef() { return collection(db, 'clubs', CLUB_ID, 'matchStats') }

// ─── Training Stats ───────────────────────────────────────────────────────────

export interface TrainingEntry {
  event: ClubEvent
  responses: EventResponse[]
}

export interface PlayerTrainingStat {
  player: Player
  total: number
  attended: number
  quote: number
  topDeclineCategory: string | null
}

/**
 * Loads all training events + their responses for a specific team within a date range.
 * Uses getDocs (one-shot) – not onSnapshot.
 * Capped at 1 year to control Firestore reads.
 */
export function useTrainingStats(teamId: string | null, weeksBack: number) {
  const [entries, setEntries] = useState<TrainingEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const cutoff = new Date(Date.now() - Math.min(weeksBack, 52) * 7 * 24 * 60 * 60 * 1000)
        const cutoffTs = Timestamp.fromDate(cutoff)

        // Load training events for this team
        const eventsSnap = await getDocs(
          query(
            eventsRef(),
            where('teamIds', 'array-contains', teamId),
            where('type', '==', 'training'),
            where('startDate', '>=', cutoffTs),
            where('startDate', '<=', Timestamp.now()),
            orderBy('startDate', 'asc')
          )
        )

        const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClubEvent)

        // Load responses for each event in parallel (batched)
        const entriesWithResponses = await Promise.all(
          events.map(async (event) => {
            const respSnap = await getDocs(responsesRef(event.id))
            const responses = respSnap.docs.map(d => d.data() as EventResponse)
            return { event, responses }
          })
        )

        setEntries(entriesWithResponses)
      } catch (e) {
        console.error('[useTrainingStats]', e)
        setError('Statistiken konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [teamId, weeksBack])

  return { entries, loading, error }
}

/**
 * Compute per-player training stats from entries + player list.
 */
export function computePlayerTrainingStats(
  entries: TrainingEntry[],
  players: Player[]
): PlayerTrainingStat[] {
  const total = entries.length

  return players.map(player => {
    let attended = 0
    const declineCounts: Record<string, number> = {}

    for (const { responses } of entries) {
      const resp = responses.find(r => r.playerId === player.id)
      if (resp?.status === 'accepted') {
        attended++
      } else if (resp?.status === 'declined' && resp.declineCategory) {
        declineCounts[resp.declineCategory] = (declineCounts[resp.declineCategory] ?? 0) + 1
      }
    }

    const topDeclineCategory =
      Object.keys(declineCounts).length > 0
        ? Object.entries(declineCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null

    return {
      player,
      total,
      attended,
      quote: total === 0 ? 0 : Math.round((attended / total) * 100),
      topDeclineCategory,
    }
  }).sort((a, b) => b.quote - a.quote)
}

/**
 * Compute team-level training quote for a period.
 */
export function computeTeamQuote(entries: TrainingEntry[], playerCount: number): number {
  if (entries.length === 0 || playerCount === 0) return 0
  const totalPossible = entries.length * playerCount
  const totalAttended = entries.reduce(
    (sum, { responses }) => sum + responses.filter(r => r.status === 'accepted').length,
    0
  )
  return Math.round((totalAttended / totalPossible) * 100)
}

// ─── Match Stats ──────────────────────────────────────────────────────────────

export interface PlayerGameStat {
  player: Player
  games: number
  starters: number
  subs: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  gameLog: {
    eventId: string
    date: Date
    opponent: string
    result: { goalsFor: number; goalsAgainst: number }
    minutesPlayed: number
    goals: number
    assists: number
    homeOrAway: 'home' | 'away'
  }[]
}

export function useMatchStatsForTeam(teamId: string | null, seasonFilter: 'current' | 'last' | 'all' | 'last2years') {
  const [stats, setStats] = useState<MatchStat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) return
    setLoading(true)

    async function load() {
      try {
        const now = new Date()
        let cutoff: Date | null = null

        if (seasonFilter === 'current') {
          // Austrian football season: Aug–May. Simple heuristic: last Aug 1.
          const thisYear = now.getFullYear()
          const seasonStart = now.getMonth() >= 7
            ? new Date(thisYear, 7, 1)
            : new Date(thisYear - 1, 7, 1)
          cutoff = seasonStart
        } else if (seasonFilter === 'last') {
          const thisYear = now.getFullYear()
          const prevSeasonStart = now.getMonth() >= 7
            ? new Date(thisYear - 1, 7, 1)
            : new Date(thisYear - 2, 7, 1)
          cutoff = prevSeasonStart
        } else if (seasonFilter === 'last2years') {
          cutoff = new Date(now.getFullYear() - 2, now.getMonth(), 1)
        }

        let q = query(
          matchStatsRef(),
          where('teamId', '==', teamId),
          orderBy('createdAt', 'desc')
        )

        if (cutoff) {
          q = query(
            matchStatsRef(),
            where('teamId', '==', teamId),
            where('createdAt', '>=', Timestamp.fromDate(cutoff)),
            orderBy('createdAt', 'desc')
          )
        }

        const snap = await getDocs(q)
        setStats(snap.docs.map(d => ({ id: d.id, ...d.data() }) as MatchStat))
      } catch (e) {
        console.error('[useMatchStats]', e)
        setError('Spieldaten konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [teamId, seasonFilter])

  return { stats, loading, error }
}

export function computePlayerGameStats(
  matchStats: MatchStat[],
  players: Player[],
  events: Record<string, ClubEvent>
): PlayerGameStat[] {
  return players.map(player => {
    const result: PlayerGameStat = {
      player,
      games: 0,
      starters: 0,
      subs: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      gameLog: [],
    }

    for (const stat of matchStats) {
      const pm = stat.playerMinutes.find(p => p.playerId === player.id)
      if (!pm) continue

      const minutesPlayed = pm.minuteOut - pm.minuteIn
      result.games++
      result.minutes += minutesPlayed
      result.goals += pm.goals
      result.assists += pm.assists
      result.yellowCards += pm.yellowCards
      if (pm.redCard) result.redCards++
      if (pm.isStarter) result.starters++
      else result.subs++

      const event = events[stat.eventId]
      result.gameLog.push({
        eventId: stat.eventId,
        date: event?.startDate instanceof Timestamp ? event.startDate.toDate() : new Date(event?.startDate as unknown as string ?? 0),
        opponent: stat.opponent,
        result: stat.result,
        minutesPlayed,
        goals: pm.goals,
        assists: pm.assists,
        homeOrAway: stat.homeOrAway,
      })
    }

    result.gameLog.sort((a, b) => b.date.getTime() - a.date.getTime())
    return result
  }).sort((a, b) => b.minutes - a.minutes)
}

// ─── Save Match Report ────────────────────────────────────────────────────────

export async function saveMatchStat(
  data: Omit<MatchStat, 'id' | 'clubId' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(matchStatsRef(), {
    ...data,
    clubId: CLUB_ID,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getMatchStatForEvent(eventId: string): Promise<MatchStat | null> {
  const snap = await getDocs(
    query(matchStatsRef(), where('eventId', '==', eventId))
  )
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as MatchStat
}

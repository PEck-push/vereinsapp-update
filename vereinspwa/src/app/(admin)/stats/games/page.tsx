'use client'

import { useState, useMemo } from 'react'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useMatchStatsForTeam, computePlayerGameStats } from '@/lib/hooks/useMatchStats'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { BarChart2 } from 'lucide-react'
import type { Team } from '@/lib/types'

type Season = 'current' | 'last' | 'all'

const SEASON_OPTIONS: { value: Season; label: string }[] = [
  { value: 'current', label: 'Diese Saison' },
  { value: 'last', label: 'Letzte Saison' },
  { value: 'all', label: 'Alle' },
]

export default function GamesStatsPage() {
  const { teams, loading: teamsLoading } = useTeams()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [season, setSeason] = useState<Season>('current')

  const selectedTeam = teams.find(t => t.id === selectedTeamId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Spieleinsätze
        </h1>
        <div className="flex gap-2">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Mannschaft wählen" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => setSeason(v as Season)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Wähle eine Mannschaft um die Einsatzstatistiken zu sehen.</p>
        </div>
      ) : (
        <GameStatsTable teamId={selectedTeamId} season={season} team={selectedTeam} />
      )}
    </div>
  )
}

function GameStatsTable({ teamId, season, team }: { teamId: string; season: Season; team: Team | null }) {
  const { stats: matchStats, loading } = useMatchStatsForTeam(teamId, season)
  const { players } = usePlayers(teamId)
  const [sortCol, setSortCol] = useState<'minutes' | 'games' | 'goals' | 'assists'>('minutes')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const activePlayers = players.filter(p => p.status !== 'inactive')

  const playerStats = useMemo(
    () => computePlayerGameStats(matchStats, activePlayers, {}),
    [matchStats, activePlayers]
  )

  const sorted = useMemo(() => {
    return [...playerStats].sort((a, b) =>
      sortDir === 'desc' ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol]
    )
  }, [playerStats, sortCol, sortDir])

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sortIcon = (col: typeof sortCol) => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (matchStats.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
        <p className="text-sm">Keine Spielberichte für diesen Zeitraum vorhanden.</p>
      </div>
    )
  }

  const teamColor = team?.color ?? '#1a1a2e'

  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: teamColor }} />
        <span className="text-sm text-gray-500">{matchStats.length} Spiele · {activePlayers.length} Spieler</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {[
                { key: null, label: 'Spieler' },
                { key: 'games', label: 'Spiele' },
                { key: null, label: 'Startelf' },
                { key: null, label: 'Eingewechselt' },
                { key: 'minutes', label: 'Minuten' },
                { key: 'goals', label: '⚽' },
                { key: 'assists', label: '🅰' },
                { key: null, label: '🟨' },
                { key: null, label: '🟥' },
              ].map(({ key, label }, i) => (
                <th
                  key={i}
                  className={`px-3 py-2.5 text-xs font-medium text-gray-500 ${i === 0 ? 'text-left' : 'text-center'} ${key ? 'cursor-pointer hover:text-gray-800' : ''}`}
                  onClick={() => key && toggleSort(key as typeof sortCol)}
                >
                  {label}{key ? sortIcon(key as typeof sortCol) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.player.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {s.player.firstName} {s.player.lastName}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.games}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.starters}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.subs}</td>
                <td className="px-3 py-2.5 text-center font-semibold" style={{ color: '#1a1a2e' }}>{s.minutes}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.goals || '–'}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{s.assists || '–'}</td>
                <td className="px-3 py-2.5 text-center">
                  {s.yellowCards > 0
                    ? <Badge variant="warning" className="text-xs">{s.yellowCards}</Badge>
                    : <span className="text-gray-300">–</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {s.redCards > 0
                    ? <Badge variant="destructive" className="text-xs">{s.redCards}</Badge>
                    : <span className="text-gray-300">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

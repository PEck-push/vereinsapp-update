'use client'

import { useState, useMemo } from 'react'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useMatchStatsForTeam, computePlayerGameStats } from '@/lib/hooks/useMatchStats'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ArrowLeft, Users2 } from 'lucide-react'
import Link from 'next/link'

const COMPARE_FIELDS = [
  { key: 'games', label: 'Spiele' },
  { key: 'minutes', label: 'Minuten' },
  { key: 'goals', label: 'Tore' },
  { key: 'assists', label: 'Assists' },
  { key: 'starters', label: 'Startelf' },
  { key: 'yellowCards', label: 'Gelbe Karten' },
] as const

export default function ComparePlayersPage() {
  const { teams } = useTeams()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [playerAId, setPlayerAId] = useState<string>('')
  const [playerBId, setPlayerBId] = useState<string>('')

  const { players } = usePlayers(selectedTeamId || undefined)
  const { stats: matchStats, loading } = useMatchStatsForTeam(selectedTeamId || null, 'all')

  const activePlayers = players.filter(p => p.status !== 'inactive')

  const playerStats = useMemo(
    () => computePlayerGameStats(matchStats, activePlayers, {}),
    [matchStats, activePlayers]
  )

  const playerA = playerStats.find(s => s.player.id === playerAId)
  const playerB = playerStats.find(s => s.player.id === playerBId)

  const chartData = useMemo(() => {
    if (!playerA || !playerB) return []
    return COMPARE_FIELDS.map(({ key, label }) => ({
      stat: label,
      [playerA.player.firstName]: playerA[key],
      [playerB.player.firstName]: playerB[key],
    }))
  }, [playerA, playerB])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/stats" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Spielervergleich
        </h1>
      </div>

      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedTeamId} onValueChange={(v) => { setSelectedTeamId(v); setPlayerAId(''); setPlayerBId('') }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Mannschaft" />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTeamId && (
          <>
            <Select value={playerAId} onValueChange={setPlayerAId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Spieler A" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers.filter(p => p.id !== playerBId).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={playerBId} onValueChange={setPlayerBId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Spieler B" />
              </SelectTrigger>
              <SelectContent>
                {activePlayers.filter(p => p.id !== playerAId).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Wähle eine Mannschaft und zwei Spieler zum Vergleichen.</p>
        </div>
      ) : loading ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : playerA && playerB ? (
        <div className="space-y-6">
          {/* Bar Chart Comparison */}
          <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
            <h2 className="text-sm font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {playerA.player.firstName} {playerA.player.lastName} vs. {playerB.player.firstName} {playerB.player.lastName}
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <XAxis dataKey="stat" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey={playerA.player.firstName} fill="var(--club-primary, #1a1a2e)" radius={[4, 4, 0, 0]} />
                <Bar dataKey={playerB.player.firstName} fill="var(--club-secondary, #e94560)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Side-by-Side Stats */}
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statistik</th>
                  <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: 'var(--club-primary, #1a1a2e)' }}>
                    {playerA.player.firstName} {playerA.player.lastName[0]}.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: 'var(--club-secondary, #e94560)' }}>
                    {playerB.player.firstName} {playerB.player.lastName[0]}.
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map(({ key, label }) => {
                  const aVal = playerA[key]
                  const bVal = playerB[key]
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-gray-700">{label}</td>
                      <td className={`px-4 py-2.5 text-center font-semibold ${aVal > bVal ? 'text-green-600' : 'text-gray-600'}`}>{aVal}</td>
                      <td className={`px-4 py-2.5 text-center font-semibold ${bVal > aVal ? 'text-green-600' : 'text-gray-600'}`}>{bVal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
          <p className="text-sm">Wähle zwei Spieler zum Vergleichen.</p>
        </div>
      )}
    </div>
  )
}

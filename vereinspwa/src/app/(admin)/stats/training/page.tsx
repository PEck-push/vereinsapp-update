'use client'

import { useState, useMemo } from 'react'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import {
  useTrainingStats,
  computePlayerTrainingStats,
  computeTeamQuote,
  type PlayerTrainingStat,
  type TrainingEntry,
} from '@/lib/hooks/useMatchStats'
import { exportCSV } from '@/lib/utils/csv'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  TrendingUp,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { Team } from '@/lib/types'

const WEEKS_OPTIONS = [
  { value: 4, label: 'Letzte 4 Wochen' },
  { value: 8, label: 'Letzte 8 Wochen' },
  { value: 12, label: 'Letzte 12 Wochen' },
  { value: 52, label: 'Diese Saison' },
]

const DECLINE_LABELS: Record<string, string> = {
  injury: 'Verletzung',
  work: 'Arbeit',
  private: 'Privates',
  other: 'Sonstiges',
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309']

export default function TrainingStatsPage() {
  const { teams, loading: teamsLoading } = useTeams()
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [weeksBack, setWeeksBack] = useState(4)

  if (teamsLoading) return <StatsPageSkeleton />

  if (selectedTeam) {
    return (
      <TeamDetail
        team={selectedTeam}
        weeksBack={weeksBack}
        onWeeksChange={setWeeksBack}
        onBack={() => setSelectedTeam(null)}
      />
    )
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold text-gray-900 mb-6"
        style={{ fontFamily: 'Outfit, sans-serif' }}
      >
        Trainingsbeteiligung
      </h1>

      {teams.length === 0 ? (
        <p className="text-sm text-gray-400">Keine Mannschaften vorhanden.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onClick={() => setSelectedTeam(team)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Team Overview Card ───────────────────────────────────────────────────────
function TeamCard({ team, onClick }: { team: Team; onClick: () => void }) {
  const { entries: recent, loading: r1 } = useTrainingStats(team.id, 4)
  const { entries: prior, loading: r2 } = useTrainingStats(team.id, 8)
  const { players } = usePlayers(team.id)

  const activePlayers = players.filter(p => p.status !== 'inactive')
  const count = activePlayers.length

  // Recent 4 weeks vs prior 4 weeks
  const now = Date.now()
  const fourWeeksAgo = now - 4 * 7 * 24 * 60 * 60 * 1000

  const recentEntries = recent
  const priorEntries = prior.filter(e => {
    const d = e.event.startDate instanceof Timestamp ? e.event.startDate.toDate() : new Date(e.event.startDate as unknown as string)
    return d.getTime() < fourWeeksAgo
  })

  const recentQuote = computeTeamQuote(recentEntries, count)
  const priorQuote = computeTeamQuote(priorEntries, count)
  const trend = recentQuote - priorQuote

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border p-5 text-left hover:shadow-md transition-shadow"
      style={{ borderRadius: '8px' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: team.color }}
        />
        <span className="font-semibold text-sm text-gray-700">{team.name}</span>
      </div>

      {r1 || r2 ? (
        <Skeleton className="h-10 w-24 mb-2" />
      ) : (
        <>
          <div className="text-4xl font-bold mb-1" style={{ color: '#1a1a2e', fontFamily: 'Outfit, sans-serif' }}>
            {recentQuote}%
          </div>
          <div className="flex items-center gap-1 text-sm">
            {trend > 0 ? (
              <><ArrowUpRight className="w-4 h-4 text-green-500" /><span className="text-green-600">+{trend}%</span></>
            ) : trend < 0 ? (
              <><ArrowDownRight className="w-4 h-4 text-red-500" /><span className="text-red-600">{trend}%</span></>
            ) : (
              <span className="text-gray-400">Kein Trend</span>
            )}
            <span className="text-gray-400 text-xs">vs. davor</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{count} Spieler · {recentEntries.length} Trainings</p>
        </>
      )}
    </button>
  )
}

// ─── Team Detail View ────────────────────────────────────────────────────────
function TeamDetail({
  team,
  weeksBack,
  onWeeksChange,
  onBack,
}: {
  team: Team
  weeksBack: number
  onWeeksChange: (w: number) => void
  onBack: () => void
}) {
  const { entries, loading } = useTrainingStats(team.id, weeksBack)
  const { players } = usePlayers(team.id)
  const [sortCol, setSortCol] = useState<'quote' | 'attended' | 'total'>('quote')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const activePlayers = players.filter(p => p.status !== 'inactive')

  const playerStats = useMemo(
    () => computePlayerTrainingStats(entries, activePlayers),
    [entries, activePlayers]
  )

  const sorted = useMemo(() => {
    return [...playerStats].sort((a, b) => {
      const v = sortDir === 'desc' ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol]
      return v
    })
  }, [playerStats, sortCol, sortDir])

  // Chart data: one bar per training session
  const chartData = entries.map(({ event, responses }) => {
    const d = event.startDate instanceof Timestamp
      ? event.startDate.toDate()
      : new Date(event.startDate as unknown as string)
    const accepted = responses.filter(r => r.status === 'accepted').length
    return {
      date: d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }),
      accepted,
      total: activePlayers.length,
      label: `${accepted} von ${activePlayers.length} Spielern`,
    }
  })

  // Horizontal bar chart for top players
  const rankData = playerStats.slice(0, 10).map(s => ({
    name: `${s.player.firstName} ${s.player.lastName[0]}.`,
    quote: s.quote,
    label: `${s.attended}/${s.total}`,
  }))

  function handleExport() {
    const rows = playerStats.map(s => ({
      Vorname: s.player.firstName,
      Nachname: s.player.lastName,
      'Trainings gesamt': s.total,
      Anwesend: s.attended,
      'Quote %': s.quote,
    }))
    const date = new Date().toISOString().split('T')[0]
    exportCSV(rows, `training-statistik-${team.name.toLowerCase().replace(/\s+/g, '-')}-${date}.csv`)
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sortIcon = (col: typeof sortCol) =>
    sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
            {team.name}
          </h1>
        </div>
        <div className="ml-auto">
          <Select value={String(weeksBack)} onValueChange={v => onWeeksChange(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Keine Trainingsdaten für diesen Zeitraum.</p>
        </div>
      ) : (
        <>
          {/* Chart 1: Beteiligung über Zeit */}
          <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
            <h2 className="text-sm font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Beteiligung über Zeit
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, activePlayers.length || 10]} />
                <Tooltip
                  formatter={(value: any, _: any, props: any) => [props.payload.label, '']}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="accepted" radius={[3, 3, 0, 0]} fill={team.color} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Spieler Ranking — Chart on sm+, List on mobile */}
          <div className="bg-white rounded-lg border p-5" style={{ borderRadius: '8px' }}>
            <h2 className="text-sm font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Spieler-Ranking (Top 10)
            </h2>
            {/* Desktop: Horizontal BarChart */}
            <div className="hidden sm:block">
              <ResponsiveContainer width="100%" height={rankData.length * 36 + 20}>
                <BarChart
                  data={rankData}
                  layout="vertical"
                  margin={{ top: 0, right: 60, bottom: 0, left: 60 }}
                >
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Quote']} />
                  <Bar dataKey="quote" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 11 }}>
                    {rankData.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? RANK_COLORS[i] : team.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Mobile: Sorted list */}
            <div className="sm:hidden space-y-2">
              {rankData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-bold text-center shrink-0" style={{ color: i < 3 ? RANK_COLORS[i] : '#6B7280' }}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{d.name}</span>
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                    <div className="h-full rounded-full" style={{ width: `${d.quote}%`, backgroundColor: i < 3 ? RANK_COLORS[i] : team.color }} />
                  </div>
                  <span className="text-sm font-semibold w-10 text-right" style={{ color: i < 3 ? RANK_COLORS[i] : '#374151' }}>
                    {d.quote}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Alle Spieler
              </h2>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Name</th>
                    <th
                      className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800"
                      onClick={() => toggleSort('total')}
                    >
                      Gesamt{sortIcon('total')}
                    </th>
                    <th
                      className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800"
                      onClick={() => toggleSort('attended')}
                    >
                      Anwesend{sortIcon('attended')}
                    </th>
                    <th
                      className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800"
                      onClick={() => toggleSort('quote')}
                    >
                      Quote{sortIcon('quote')}
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">
                      Häuf. Absagegrund
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(s => (
                    <tr key={s.player.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {s.player.firstName} {s.player.lastName}
                        {s.player.status === 'injured' && (
                          <Badge variant="warning" className="ml-2 text-[10px]">Verletzt</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{s.total}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{s.attended}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className="font-semibold"
                          style={{ color: s.quote >= 70 ? '#16a34a' : s.quote >= 50 ? '#ca8a04' : '#dc2626' }}
                        >
                          {s.quote}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">
                        {s.topDeclineCategory ? DECLINE_LABELS[s.topDeclineCategory] : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatsPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    </div>
  )
}
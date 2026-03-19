'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useTeams } from '@/lib/hooks/useTeams'
import { PlayerSheet } from '@/components/players/PlayerSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Archive, Loader2, Plus, Search, UserX } from 'lucide-react'
import type { Player, Team } from '@/lib/types'

type PlayerFormData = {
  firstName: string
  lastName: string
  email: string
  phone?: string
  dateOfBirth?: string
  jerseyNumber?: number | ''
  position?: 'Tormann' | 'Abwehr' | 'Mittelfeld' | 'Sturm'
  teamIds: string[]
  status: 'active' | 'injured' | 'inactive'
  notificationPrefs: { push: boolean; email: boolean }
}

const STATUS_BADGE: Record<
  Player['status'],
  { label: string; variant: 'success' | 'warning' | 'muted' }
> = {
  active: { label: 'Aktiv', variant: 'success' },
  injured: { label: 'Verletzt', variant: 'warning' },
  inactive: { label: 'Inaktiv', variant: 'muted' },
}

export default function PlayersPage() {
  const { players, loading, addPlayer, updatePlayer, archivePlayer } = usePlayers()
  const { teams } = useTeams()

  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  // Search + status filter (applied regardless of team grouping)
  const baseFiltered = useMemo(() => {
    const q = search.toLowerCase()
    return players.filter((p) => {
      const matchSearch =
        !q ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || p.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [players, search, filterStatus])

  // Team filter on top
  const filtered = useMemo(() => {
    if (filterTeam === 'all') return baseFiltered
    return baseFiltered.filter((p) => p.teamIds.includes(filterTeam))
  }, [baseFiltered, filterTeam])

  // Group by team when no team filter is active
  const groupedByTeam = useMemo(() => {
    if (filterTeam !== 'all') return null // flat list when filtered

    const groups: { team: Team; players: Player[] }[] = []
    const assignedPlayerIds = new Set<string>()

    for (const team of teams) {
      const teamPlayers = baseFiltered
        .filter((p) => p.teamIds.includes(team.id))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'))
      if (teamPlayers.length > 0) {
        groups.push({ team, players: teamPlayers })
        teamPlayers.forEach((p) => assignedPlayerIds.add(p.id))
      }
    }

    // Players without any team
    const unassigned = baseFiltered
      .filter((p) => !assignedPlayerIds.has(p.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'))

    return { groups, unassigned }
  }, [baseFiltered, teams, filterTeam])

  function getTeamNames(teamIds: string[]): string {
    return (
      teamIds
        .map((id) => teams.find((t) => t.id === id)?.name)
        .filter(Boolean)
        .join(', ') || '–'
    )
  }

  function openEdit(player: Player) {
    setEditingPlayer(player)
    setSheetOpen(true)
  }

  function openCreate() {
    setEditingPlayer(null)
    setSheetOpen(true)
  }

  async function handleSheetSubmit(data: PlayerFormData) {
    const normalized = {
      ...data,
      jerseyNumber: data.jerseyNumber || undefined,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
    }
    if (editingPlayer) {
      await updatePlayer(editingPlayer.id, normalized)
    } else {
      await addPlayer(normalized as Parameters<typeof addPlayer>[0])
    }
  }

  const activeCount = players.filter((p) => p.status !== 'inactive').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-semibold text-gray-900"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Spieler
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} aktive Spieler · {teams.length} Mannschaften
          </p>
        </div>
        <Button onClick={openCreate} style={{ backgroundColor: '#e94560', borderRadius: '6px' }}>
          <Plus className="w-4 h-4 mr-2" />
          Spieler anlegen
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Name oder E-Mail suchen…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Alle Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Teams (gruppiert)</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Alle Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="injured">Verletzt</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <UserX className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Keine Spieler gefunden.</p>
        </div>
      ) : groupedByTeam ? (
        /* ─── Grouped View (no team filter active) ─── */
        <div className="space-y-4">
          {groupedByTeam.groups.map(({ team, players: teamPlayers }) => (
            <TeamGroup
              key={team.id}
              team={team}
              players={teamPlayers}
              allTeams={teams}
              onEdit={openEdit}
              onArchive={archivePlayer}
              getTeamNames={getTeamNames}
            />
          ))}
          {groupedByTeam.unassigned.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-3 h-3 rounded-full bg-gray-300" />
                <span
                  className="text-sm font-semibold text-gray-500"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  Ohne Mannschaft
                </span>
                <span className="text-xs text-gray-400">
                  ({groupedByTeam.unassigned.length})
                </span>
              </div>
              <PlayerTable
                players={groupedByTeam.unassigned}
                allTeams={teams}
                onEdit={openEdit}
                onArchive={archivePlayer}
                getTeamNames={getTeamNames}
              />
            </div>
          )}
        </div>
      ) : (
        /* ─── Flat View (specific team filter active) ─── */
        <PlayerTable
          players={filtered}
          allTeams={teams}
          onEdit={openEdit}
          onArchive={archivePlayer}
          getTeamNames={getTeamNames}
        />
      )}

      <PlayerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        player={editingPlayer}
        teams={teams}
        onSubmit={handleSheetSubmit}
      />
    </div>
  )
}

// ─── Team Group Header + Table ────────────────────────────────────────────────
function TeamGroup({
  team,
  players,
  allTeams,
  onEdit,
  onArchive,
  getTeamNames,
}: {
  team: Team
  players: Player[]
  allTeams: Team[]
  onEdit: (p: Player) => void
  onArchive: (id: string) => void
  getTeamNames: (ids: string[]) => string
}) {
  const activeCount = players.filter((p) => p.status !== 'inactive').length

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: team.color }}
        />
        <span
          className="text-sm font-semibold text-gray-800"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {team.name}
        </span>
        <span className="text-xs text-gray-400">
          {activeCount} aktiv · {players.length} gesamt
        </span>
      </div>
      <PlayerTable
        players={players}
        allTeams={allTeams}
        onEdit={onEdit}
        onArchive={onArchive}
        getTeamNames={getTeamNames}
      />
    </div>
  )
}

// ─── Reusable Player Table ────────────────────────────────────────────────────
function PlayerTable({
  players,
  allTeams,
  onEdit,
  onArchive,
  getTeamNames,
}: {
  players: Player[]
  allTeams: Team[]
  onEdit: (p: Player) => void
  onArchive: (id: string) => void
  getTeamNames: (ids: string[]) => string
}) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Team(s)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-20 text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => {
            const statusInfo = STATUS_BADGE[player.status]
            return (
              <TableRow key={player.id}>
                <TableCell>
                  <Link
                    href={`/players/${player.id}`}
                    className="font-medium hover:underline"
                    style={{ color: '#1a1a2e' }}
                  >
                    {player.firstName} {player.lastName}
                  </Link>
                  <p className="text-xs text-gray-400">{player.email}</p>
                </TableCell>
                <TableCell className="text-center text-sm text-gray-600">
                  {player.jerseyNumber ?? '–'}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {player.position ?? '–'}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {player.teamIds.map((id) => {
                      const t = allTeams.find((tm) => tm.id === id)
                      if (!t) return null
                      return (
                        <span key={id} className="flex items-center gap-1">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="text-xs">{t.name}</span>
                        </span>
                      )
                    })}
                    {player.teamIds.length === 0 && '–'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-gray-700"
                      onClick={() => onEdit(player)}
                      title="Bearbeiten"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                      onClick={() => onArchive(player.id)}
                      title="Archivieren"
                      disabled={player.status === 'inactive'}
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

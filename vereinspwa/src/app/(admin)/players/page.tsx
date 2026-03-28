'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useTeams } from '@/lib/hooks/useTeams'
import { PlayerSheet } from '@/components/players/PlayerSheet'
import { InviteLinkDialog } from '@/components/players/InviteLinkDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Archive, Link2, Loader2, MoreHorizontal, Pencil, Plus, Search,
  Send, Trash2, UserX, Users,
} from 'lucide-react'
import { toast } from '@/components/ui/toaster'
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

const STATUS_BADGE: Record<Player['status'], { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  active: { label: 'Aktiv', variant: 'success' },
  injured: { label: 'Verletzt', variant: 'warning' },
  inactive: { label: 'Inaktiv', variant: 'muted' },
}

interface InviteResult {
  playerName: string
  inviteUrl: string
  expiresAt?: string
}

export default function PlayersPage() {
  const { players, loading, addPlayer, updatePlayer, archivePlayer } = usePlayers()
  const { teams } = useTeams()

  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Invite State ──
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [bulkInviteResults, setBulkInviteResults] = useState<InviteResult[]>([])
  const [bulkInviting, setBulkInviting] = useState(false)

  const baseFiltered = useMemo(() => {
    const q = search.toLowerCase()
    return players.filter((p) => {
      const matchSearch = !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || p.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [players, search, filterStatus])

  const filtered = useMemo(() => {
    if (filterTeam === 'all') return baseFiltered
    return baseFiltered.filter((p) => p.teamIds.includes(filterTeam))
  }, [baseFiltered, filterTeam])

  const groupedByTeam = useMemo(() => {
    if (filterTeam !== 'all') return null
    const groups: { team: Team; players: Player[] }[] = []
    const assignedPlayerIds = new Set<string>()
    for (const team of teams) {
      const teamPlayers = baseFiltered.filter(p => p.teamIds.includes(team.id)).sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'))
      if (teamPlayers.length > 0) { groups.push({ team, players: teamPlayers }); teamPlayers.forEach(p => assignedPlayerIds.add(p.id)) }
    }
    const unassigned = baseFiltered.filter(p => !assignedPlayerIds.has(p.id)).sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'))
    return { groups, unassigned }
  }, [baseFiltered, teams, filterTeam])

  // Players without active accounts (for bulk invite)
  const uninvitedPlayers = useMemo(
    () => players.filter(p => p.accountStatus !== 'active' && p.status !== 'inactive'),
    [players]
  )

  function openEdit(player: Player) { setEditingPlayer(player); setSheetOpen(true) }
  function openCreate() { setEditingPlayer(null); setSheetOpen(true) }

  // ── Generate invite for a single player ──
  async function generateInvite(playerId: string): Promise<InviteResult | null> {
    try {
      const res = await fetch('/api/auth/generate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Einladung fehlgeschlagen', data.error)
        return null
      }
      return {
        playerName: data.playerName,
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
      }
    } catch {
      toast.error('Einladung fehlgeschlagen')
      return null
    }
  }

  // ── After creating a new player: auto-generate invite ──
  async function handleSheetSubmit(data: PlayerFormData) {
    const normalized = {
      ...data,
      jerseyNumber: data.jerseyNumber || undefined,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
    }

    if (editingPlayer) {
      await updatePlayer(editingPlayer.id, normalized)
      return
    }

    // Create player
    const newPlayerId = await addPlayer(normalized as Parameters<typeof addPlayer>[0])

    // Auto-generate invite
    setInviteLoading(true)
    setInviteDialogOpen(true)
    setInviteResult(null)
    setBulkInviteResults([])

    const result = await generateInvite(newPlayerId)
    setInviteResult(result)
    setInviteLoading(false)
  }

  // ── Single re-invite from dropdown ──
  async function handleReinvite(player: Player) {
    setInviteLoading(true)
    setInviteDialogOpen(true)
    setInviteResult(null)
    setBulkInviteResults([])

    const result = await generateInvite(player.id)
    setInviteResult(result)
    setInviteLoading(false)
  }

  // ── Bulk invite ──
  async function handleBulkInvite() {
    const playerIds = uninvitedPlayers.map(p => p.id)
    if (playerIds.length === 0) return

    setBulkInviting(true)
    setInviteDialogOpen(true)
    setInviteResult(null)
    setBulkInviteResults([])
    setInviteLoading(true)

    try {
      const res = await fetch('/api/auth/generate-invite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Bulk-Einladung fehlgeschlagen', data.error)
        setInviteDialogOpen(false)
        return
      }
      const results: InviteResult[] = data.results
        .filter((r: { inviteUrl: string }) => r.inviteUrl)
        .map((r: { playerName: string; inviteUrl: string }) => ({
          playerName: r.playerName,
          inviteUrl: r.inviteUrl,
        }))
      setBulkInviteResults(results)
      toast.success(`${results.length} Einladungen erstellt`)
    } catch {
      toast.error('Bulk-Einladung fehlgeschlagen')
      setInviteDialogOpen(false)
    } finally {
      setInviteLoading(false)
      setBulkInviting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'clubs', CLUB_ID, 'players', deleteTarget.id))
      toast.success('Spieler gelöscht', `${deleteTarget.firstName} ${deleteTarget.lastName} wurde entfernt.`)
      setDeleteTarget(null)
    } catch {
      toast.error('Löschen fehlgeschlagen', 'Bitte nochmals versuchen.')
    } finally { setDeleting(false) }
  }

  const activeCount = players.filter(p => p.status !== 'inactive').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Spieler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activeCount} aktive Spieler · {teams.length} Mannschaften</p>
        </div>
        <div className="flex gap-2">
          {uninvitedPlayers.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleBulkInvite} disabled={bulkInviting}>
              {bulkInviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {uninvitedPlayers.length} einladen
            </Button>
          )}
          <Button onClick={openCreate} variant="club">
            <Plus className="w-4 h-4 mr-2" />
            Spieler anlegen
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Name oder E-Mail suchen…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Alle Teams" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Teams (gruppiert)</SelectItem>
            {teams.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Alle Status" /></SelectTrigger>
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
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <UserX className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Keine Spieler gefunden.</p>
        </div>
      ) : groupedByTeam ? (
        <div className="space-y-4">
          {groupedByTeam.groups.map(({ team, players: tp }) => (
            <TeamGroup key={team.id} team={team} players={tp} allTeams={teams} onEdit={openEdit} onArchive={archivePlayer} onDelete={setDeleteTarget} onInvite={handleReinvite} />
          ))}
          {groupedByTeam.unassigned.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm font-semibold text-gray-500" style={{ fontFamily: 'Outfit, sans-serif' }}>Ohne Mannschaft</span>
                <span className="text-xs text-gray-400">({groupedByTeam.unassigned.length})</span>
              </div>
              <PlayerTable players={groupedByTeam.unassigned} allTeams={teams} onEdit={openEdit} onArchive={archivePlayer} onDelete={setDeleteTarget} onInvite={handleReinvite} />
            </div>
          )}
        </div>
      ) : (
        <PlayerTable players={filtered} allTeams={teams} onEdit={openEdit} onArchive={archivePlayer} onDelete={setDeleteTarget} onInvite={handleReinvite} />
      )}

      <PlayerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} player={editingPlayer} teams={teams} onSubmit={handleSheetSubmit} />

      {/* Invite Dialog */}
      <InviteLinkDialog
        open={inviteDialogOpen}
        onClose={() => { setInviteDialogOpen(false); setInviteResult(null); setBulkInviteResults([]) }}
        invite={inviteResult}
        bulkInvites={bulkInviteResults.length > 0 ? bulkInviteResults : undefined}
        loading={inviteLoading}
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Spieler endgültig löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong> wird unwiderruflich gelöscht.
            Alle zugehörigen Statistiken und Antworten bleiben bestehen, sind aber nicht mehr zuordenbar.
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-md">
            Tipp: Wenn der Spieler nur inaktiv werden soll (z.B. Saisonende), nutze stattdessen „Archivieren".
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TeamGroup({ team, players, allTeams, onEdit, onArchive, onDelete, onInvite }: {
  team: Team; players: Player[]; allTeams: Team[]; onEdit: (p: Player) => void; onArchive: (id: string) => void; onDelete: (p: Player) => void; onInvite: (p: Player) => void
}) {
  const activeCount = players.filter(p => p.status !== 'inactive').length
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
        <span className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{team.name}</span>
        <span className="text-xs text-gray-400">{activeCount} aktiv · {players.length} gesamt</span>
      </div>
      <PlayerTable players={players} allTeams={allTeams} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} onInvite={onInvite} />
    </div>
  )
}

function PlayerTable({ players, allTeams, onEdit, onArchive, onDelete, onInvite }: {
  players: Player[]; allTeams: Team[]; onEdit: (p: Player) => void; onArchive: (id: string) => void; onDelete: (p: Player) => void; onInvite: (p: Player) => void
}) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-16 text-center hidden sm:table-cell">#</TableHead>
            <TableHead className="hidden md:table-cell">Position</TableHead>
            <TableHead className="hidden lg:table-cell">Team(s)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12 text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map(player => {
            const statusInfo = STATUS_BADGE[player.status]
            const needsInvite = player.accountStatus !== 'active' && player.status !== 'inactive'
            return (
              <TableRow key={player.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/players/${player.id}`} className="font-medium hover:underline" style={{ color: 'var(--club-primary, #1a1a2e)' }}>
                      {player.firstName} {player.lastName}
                    </Link>
                    {needsInvite && (
                      <Badge variant="warning" className="text-[10px]">Kein Zugang</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{player.email}</p>
                </TableCell>
                <TableCell className="text-center text-sm text-gray-600 hidden sm:table-cell">{player.jerseyNumber ?? '–'}</TableCell>
                <TableCell className="text-sm text-gray-600 hidden md:table-cell">{player.position ?? '–'}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {player.teamIds.map(id => {
                      const t = allTeams.find(tm => tm.id === id)
                      if (!t) return null
                      return <span key={id} className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} /><span className="text-xs">{t.name}</span></span>
                    })}
                    {player.teamIds.length === 0 && '–'}
                  </div>
                </TableCell>
                <TableCell><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(player)}>
                        <Pencil className="w-4 h-4 mr-2" />Bearbeiten
                      </DropdownMenuItem>
                      {needsInvite && (
                        <DropdownMenuItem onClick={() => onInvite(player)}>
                          <Link2 className="w-4 h-4 mr-2" />Einladungslink
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onArchive(player.id)} disabled={player.status === 'inactive'}>
                        <Archive className="w-4 h-4 mr-2" />Archivieren
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(player)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" />Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
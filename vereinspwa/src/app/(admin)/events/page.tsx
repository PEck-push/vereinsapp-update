'use client'

import { useState, useMemo } from 'react'
import { useEvents } from '@/lib/hooks/useEvents'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { EventSheet } from '@/components/events/EventSheet'
import { EventResponsePanel } from '@/components/events/EventResponsePanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CalendarDays, ChevronDown, ChevronUp, Loader2, MapPin, MoreHorizontal, Plus, Search, Trash2, Users, XCircle } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { ClubEvent } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = { training: 'Training', match: 'Spiel', meeting: 'Besprechung', other: 'Termin' }
function toDate(d: unknown): Date { if (d instanceof Timestamp) return d.toDate(); if (d instanceof Date) return d; return new Date(d as string) }
type ViewMode = 'upcoming' | 'past' | 'all'

export default function EventsPage() {
  const { events, loading, addEvent, updateEvent, deleteEvent } = useEvents()
  const { teams } = useTeams()
  const { players } = usePlayers()

  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('upcoming')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [responseTab, setResponseTab] = useState<'accepted' | 'declined' | 'pending'>('pending')
  const [cancelTarget, setCancelTarget] = useState<ClubEvent | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ClubEvent | null>(null)

  const now = new Date()
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return events.filter(e => {
      const matchSearch = !q || e.title.toLowerCase().includes(q)
      const matchTeam = filterTeam === 'all' || e.teamIds.includes(filterTeam)
      const matchType = filterType === 'all' || e.type === filterType
      const eventDate = toDate(e.startDate)
      const matchView = viewMode === 'all' || (viewMode === 'upcoming' && eventDate >= now) || (viewMode === 'past' && eventDate < now)
      return matchSearch && matchTeam && matchType && matchView
    }).sort((a, b) => { const da = toDate(a.startDate).getTime(), db = toDate(b.startDate).getTime(); return viewMode === 'past' ? db - da : da - db })
  }, [events, search, filterTeam, filterType, viewMode, now])

  function openCreate() { setEditingEvent(null); setSheetOpen(true) }
  function openEdit(event: ClubEvent) { setEditingEvent(event); setSheetOpen(true) }

  async function handleSheetSubmit(data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>) {
    if (editingEvent) await updateEvent(editingEvent.id, data)
    else await addEvent(data)
  }

  async function handleCancel() {
    if (!cancelTarget) return
    await updateEvent(cancelTarget.id, { status: 'cancelled', cancelReason: cancelReason.trim() || undefined } as Partial<ClubEvent>)
    setCancelTarget(null); setCancelReason('')
  }

  async function handleDelete() { if (!deleteTarget) return; await deleteEvent(deleteTarget.id); setDeleteTarget(null) }

  function getTeamNames(teamIds: string[]): string { return teamIds.map(id => teams.find(t => t.id === id)?.name).filter(Boolean).join(', ') || '–' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Termine</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} {filtered.length === 1 ? 'Termin' : 'Termine'}</p>
        </div>
        <Button onClick={openCreate} variant="club"><Plus className="w-4 h-4 mr-2" />Termin anlegen</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input placeholder="Termin suchen…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Alle Teams" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Teams</SelectItem>
            {teams.map(t => <SelectItem key={t.id} value={t.id}><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</span></SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Alle Typen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {([{ key: 'upcoming' as ViewMode, label: 'Kommende' }, { key: 'past' as ViewMode, label: 'Vergangene' }, { key: 'all' as ViewMode, label: 'Alle' }]).map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === tab.key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>{tab.label}</button>
        ))}
      </div>

      {/* Events List */}
      {loading ? <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      : filtered.length === 0 ? <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg"><CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Keine Termine gefunden.</p></div>
      : (
        <div className="space-y-2">
          {filtered.map(event => {
            const date = toDate(event.startDate)
            const isPast = date < now
            const isExpanded = expandedId === event.id
            const firstTeam = event.teamIds.length > 0 ? teamMap.get(event.teamIds[0]) : null
            const teamColor = firstTeam?.color ?? '#F59E0B'
            const eventPlayers = players.filter(p => p.teamIds.some(id => event.teamIds.includes(id)) && p.status !== 'inactive')

            return (
              <div key={event.id} className={`bg-white rounded-lg border overflow-hidden ${isPast ? 'opacity-70' : ''}`} style={{ borderRadius: '8px' }}>
                <div className="flex">
                  {/* Color bar */}
                  <div className="w-1.5 shrink-0" style={{ backgroundColor: teamColor }} />

                  <div className="flex-1 p-4 min-w-0">
                    {/* Row 1: Type + Title + Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-gray-400">{TYPE_LABELS[event.type] ?? 'Termin'}</span>
                        <p className="font-medium text-gray-900 text-sm mt-0.5">{event.title}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setExpandedId(isExpanded ? null : event.id)} className="p-1 text-gray-400 hover:text-gray-700">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(event)}>Bearbeiten</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCancelTarget(event)} className="text-orange-600"><XCircle className="w-4 h-4 mr-2" />Absagen</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteTarget(event)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Löschen</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Row 2: Details (stacked on mobile) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 text-xs text-gray-500">
                      <span>{date.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })} · {date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
                      {event.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{event.location}</span>}
                      <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{getTeamNames(event.teamIds)}</span>
                    </div>

                    {/* Row 3: Response badges */}
                    <div className="flex items-center gap-2 mt-2.5">
                      <Badge variant="success" className="text-xs">{event.responseCount?.accepted ?? 0} zugesagt</Badge>
                      <Badge variant="destructive" className="text-xs bg-red-100 text-red-700 border-0">{event.responseCount?.declined ?? 0} abgesagt</Badge>
                      <Badge variant="muted" className="text-xs">{eventPlayers.length - (event.responseCount?.total ?? 0)} offen</Badge>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-gray-50">
                    <EventResponsePanel eventId={event.id} allPlayers={players} eventTeamIds={event.teamIds} activeTab={responseTab} onTabChange={setResponseTab} onSendReminder={() => {}} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <EventSheet open={sheetOpen} onClose={() => setSheetOpen(false)} event={editingEvent} teams={teams} onSubmit={handleSheetSubmit} />

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Termin absagen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600"><strong>{cancelTarget?.title}</strong> wird abgesagt.</p>
          <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Grund (optional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Abbrechen</Button>
            <Button onClick={handleCancel} className="bg-orange-500 hover:bg-orange-600 text-white">Termin absagen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Termin löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600"><strong>{deleteTarget?.title}</strong> wird unwiderruflich gelöscht.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete}>Löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
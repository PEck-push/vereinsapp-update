'use client'

import { useState, useMemo } from 'react'
import { useEvents } from '@/lib/hooks/useEvents'
import { useTeams } from '@/lib/hooks/useTeams'
import { EventSheet } from '@/components/events/EventSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CalendarDays, ChevronLeft, ChevronRight, Grid3X3, LayoutList,
  Loader2, MapPin, Plus, Users,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { ClubEvent, RecurrenceFrequency, Team } from '@/lib/types'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Spiel',
  meeting: 'Besprechung',
  event: 'Vereins-Event',
  other: 'Termin',
}
const CLUB_EVENT_COLOR = '#F59E0B'

function toDate(d: unknown): Date { if (d instanceof Timestamp) return d.toDate(); if (d instanceof Date) return d; return new Date(d as string) }
function isSameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function getMonday(d: Date): Date { const date = new Date(d); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); date.setHours(0,0,0,0); return date }
function getEventColor(event: ClubEvent, teamMap: Map<string, Team>): string { if (event.teamIds.length === 0) return CLUB_EVENT_COLOR; return teamMap.get(event.teamIds[0])?.color ?? CLUB_EVENT_COLOR }
function getEventTeamNames(event: ClubEvent, teamMap: Map<string, Team>): string { if (event.teamIds.length === 0) return 'Vereins-Event'; return event.teamIds.map(id => teamMap.get(id)?.name).filter(Boolean).join(', ') }

type ViewMode = 'list' | 'week' | 'month'
type TimeFilter = 'upcoming' | 'past'

export default function CalendarPage() {
  const { events, loading, addEvent } = useEvents()
  const { teams } = useTeams()
  const [filterTeam, setFilterTeam] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('upcoming')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  const filteredEvents = useMemo(() => {
    if (filterTeam === 'club-events') return events.filter(e => e.teamIds.length === 0)
    if (filterTeam !== 'all') return events.filter(e => e.teamIds.includes(filterTeam))
    return events
  }, [events, filterTeam])

  async function handleAddEvent(
    data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>,
    recurrence?: { frequency: RecurrenceFrequency; daysOfWeek: number[]; until: Date }
  ) {
    await addEvent(data, recurrence)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Kalender</h1>
        <Button onClick={() => setSheetOpen(true)} variant="club"><Plus className="w-4 h-4 mr-2" />Termin</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {([
            { key: 'list' as ViewMode, label: 'Liste', icon: LayoutList },
            { key: 'week' as ViewMode, label: 'Woche', icon: CalendarDays },
            { key: 'month' as ViewMode, label: 'Monat', icon: Grid3X3 },
          ]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setViewMode(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Alle anzeigen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle anzeigen</SelectItem>
            <SelectItem value="club-events"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLUB_EVENT_COLOR }} />Vereins-Events</span></SelectItem>
            {teams.map(t => (<SelectItem key={t.id} value={t.id}><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</span></SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        : viewMode === 'list' ? <ListView events={filteredEvents} teamMap={teamMap} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} />
        : viewMode === 'week' ? <WeekView events={filteredEvents} teamMap={teamMap} currentDate={currentDate} onDateChange={setCurrentDate} />
        : <MonthView events={filteredEvents} teamMap={teamMap} teams={teams} currentDate={currentDate} onDateChange={setCurrentDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      }

      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 flex-wrap">
        {teams.map(t => <div key={t.id} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</div>)}
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CLUB_EVENT_COLOR }} />Vereins-Events</div>
      </div>

      <EventSheet open={sheetOpen} onClose={() => setSheetOpen(false)} event={null} teams={teams} onSubmit={handleAddEvent} />
    </div>
  )
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────
function ListView({ events, teamMap, timeFilter, onTimeFilterChange }: {
  events: ClubEvent[]; teamMap: Map<string, Team>; timeFilter: TimeFilter; onTimeFilterChange: (f: TimeFilter) => void
}) {
  const now = new Date()
  const sorted = useMemo(() => {
    return events.filter(e => { const d = toDate(e.startDate); return timeFilter === 'upcoming' ? d >= now : d < now })
      .sort((a, b) => { const da = toDate(a.startDate).getTime(), db = toDate(b.startDate).getTime(); return timeFilter === 'upcoming' ? da - db : db - da })
  }, [events, timeFilter, now])

  const grouped = useMemo(() => {
    const groups: { date: Date; events: ClubEvent[] }[] = []
    let current: { date: Date; events: ClubEvent[] } | null = null
    for (const event of sorted) {
      const d = toDate(event.startDate)
      if (!current || !isSameDay(current.date, d)) { current = { date: d, events: [] }; groups.push(current) }
      current.events.push(event)
    }
    return groups
  }, [sorted])

  return (
    <div>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        <button onClick={() => onTimeFilterChange('upcoming')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'upcoming' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Demnächst</button>
        <button onClick={() => onTimeFilterChange('past')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'past' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Vorherige</button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg"><CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{timeFilter === 'upcoming' ? 'Keine kommenden Termine' : 'Keine vergangenen Termine'}</p></div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, events: dayEvents }) => {
            const isToday = isSameDay(date, now)
            return (
              <div key={date.toISOString()}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-center shrink-0" style={{ minWidth: '48px' }}>
                    <p className={`text-xs font-medium ${isToday ? 'text-[var(--club-secondary,#e94560)]' : 'text-gray-400'}`}>
                      {date.toLocaleDateString('de-AT', { weekday: 'short' })}.
                    </p>
                    <p className={`text-2xl font-bold leading-tight w-11 h-11 rounded-full inline-flex items-center justify-center ${isToday ? 'text-white' : 'text-gray-800'}`}
                      style={isToday ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}>
                      {date.getDate()}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">
                    {date.toLocaleDateString('de-AT', { month: 'long' })}
                  </p>
                </div>
                <div className="space-y-2 pl-[60px]">
                  {dayEvents.map(event => <ListEventCard key={event.id} event={event} teamMap={teamMap} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ListEventCard({ event, teamMap }: { event: ClubEvent; teamMap: Map<string, Team> }) {
  const d = toDate(event.startDate)
  const endDate = event.endDate ? toDate(event.endDate) : null
  const color = getEventColor(event, teamMap)
  const teamNames = getEventTeamNames(event, teamMap)
  const timeStr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  const endTimeStr = endDate ? endDate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : null
  const accepted = event.responseCount?.accepted ?? 0
  const declined = event.responseCount?.declined ?? 0

  return (
    <div className="bg-white rounded-lg border overflow-hidden hover:shadow-sm transition-shadow" style={{ borderRadius: '8px' }}>
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 text-sm">{event.title}</p>
            {event.recurrenceGroupId && <span className="text-[10px] text-gray-400" title="Wiederkehrender Termin">🔄</span>}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 text-xs text-gray-500">
            <span>{timeStr}{endTimeStr ? ` - ${endTimeStr}` : ''} Uhr</span>
            {event.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{event.location}</span>}
            <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{teamNames}</span>
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <span className="text-xs"><span className="font-semibold text-green-700">{accepted}</span> <span className="text-gray-400">zugesagt</span></span>
            <span className="text-xs"><span className="font-semibold text-red-600">{declined}</span> <span className="text-gray-400">abgesagt</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────
function WeekView({ events, teamMap, currentDate, onDateChange }: {
  events: ClubEvent[]; teamMap: Map<string, Team>; currentDate: Date; onDateChange: (d: Date) => void
}) {
  const monday = getMonday(currentDate); const today = new Date()
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d })
  function prevWeek() { const d = new Date(monday); d.setDate(d.getDate() - 7); onDateChange(d) }
  function nextWeek() { const d = new Date(monday); d.setDate(d.getDate() + 7); onDateChange(d) }
  const sundayDate = weekDays[6]
  const weekLabel = `${monday.getDate()}. ${MONTHS[monday.getMonth()].slice(0,3)} – ${sundayDate.getDate()}. ${MONTHS[sundayDate.getMonth()].slice(0,3)} ${sundayDate.getFullYear()}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-base font-semibold min-w-[220px] text-center" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>{weekLabel}</h2>
          <button onClick={nextWeek} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <button onClick={() => onDateChange(new Date())} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded-md hover:bg-gray-100">Heute</button>
      </div>
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
        <div className="grid grid-cols-7 divide-x">
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today)
            const dayEvents = events.filter(e => isSameDay(toDate(e.startDate), day)).sort((a,b) => toDate(a.startDate).getTime() - toDate(b.startDate).getTime())
            return (
              <div key={i} className="min-h-[140px]">
                <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-xs font-medium ${isToday ? 'text-[var(--club-secondary,#e94560)]' : 'text-gray-400'}`}>{WEEKDAYS[i]}</p>
                  <p className={`text-sm font-bold w-7 h-7 rounded-full inline-flex items-center justify-center ${isToday ? 'text-white' : 'text-gray-800'}`}
                    style={isToday ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}>{day.getDate()}</p>
                </div>
                <div className="p-1 space-y-1">
                  {dayEvents.slice(0,4).map(ev => {
                    const color = getEventColor(ev, teamMap); const time = toDate(ev.startDate).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
                    return <div key={ev.id} className="text-[10px] font-medium px-1.5 py-1 rounded truncate" style={{ backgroundColor: `${color}15`, color }} title={`${ev.title} – ${time}`}><span className="opacity-70">{time}</span> {ev.title}</div>
                  })}
                  {dayEvents.length > 4 && <p className="text-[10px] text-gray-400 text-center">+{dayEvents.length - 4}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── MONTH VIEW ───────────────────────────────────────────────────────────────
function MonthView({ events, teamMap, teams, currentDate, onDateChange, selectedDate, onSelectDate }: {
  events: ClubEvent[]; teamMap: Map<string, Team>; teams: Team[]; currentDate: Date; onDateChange: (d: Date) => void; selectedDate: Date | null; onSelectDate: (d: Date | null) => void
}) {
  const year = currentDate.getFullYear(); const month = currentDate.getMonth(); const today = new Date()
  function prevMonth() { onDateChange(new Date(year, month - 1, 1)); onSelectDate(null) }
  function nextMonth() { onDateChange(new Date(year, month + 1, 1)); onSelectDate(null) }

  const days: Date[] = []; const date = new Date(year, month, 1); while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1) }
  const firstDayOfWeek = (days[0].getDay() + 6) % 7
  const paddingBefore = Array.from({ length: firstDayOfWeek }, (_, i) => new Date(year, month, -firstDayOfWeek + i + 1))
  const allCells = [...paddingBefore, ...days]
  const remaining = (7 - (allCells.length % 7)) % 7
  const grid = [...allCells, ...Array.from({ length: remaining }, (_, i) => new Date(year, month + 1, i + 1))]
  const selectedDayEvents = selectedDate ? events.filter(e => isSameDay(toDate(e.startDate), selectedDate)) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>{MONTHS[month]} {year}</h2>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <button onClick={() => { onDateChange(new Date()); onSelectDate(new Date()) }} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded-md hover:bg-gray-100">Heute</button>
      </div>
      <div className="flex gap-4 flex-col lg:flex-row">
        <div className="flex-1 bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
          <div className="grid grid-cols-7 border-b">{WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {grid.map((cellDate, i) => {
              const isCurrentMonth = cellDate.getMonth() === month; const isToday = isSameDay(cellDate, today); const isSelected = selectedDate && isSameDay(cellDate, selectedDate)
              const dayEvents = events.filter(e => isSameDay(toDate(e.startDate), cellDate))
              return (
                <button key={i} onClick={() => onSelectDate(cellDate)}
                  className={`min-h-[72px] md:min-h-[88px] p-1.5 border-b border-r text-left transition-colors ${!isCurrentMonth ? 'bg-gray-50' : 'hover:bg-gray-50'} ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${isToday ? 'text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}`}
                    style={isToday ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}>{cellDate.getDate()}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayEvents.slice(0,3).map(ev => { const color = getEventColor(ev, teamMap); return (
                      <div key={ev.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium truncate" style={{ backgroundColor: `${color}15`, color }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="truncate hidden sm:inline">{ev.title}</span>
                      </div>
                    )})}
                    {dayEvents.length > 3 && <span className="text-[10px] text-gray-400 pl-1">+{dayEvents.length - 3}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="lg:w-72 shrink-0">
          {selectedDate ? (
            <div className="bg-white rounded-lg border p-4" style={{ borderRadius: '8px' }}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>{selectedDate.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              {selectedDayEvents.length === 0 ? <p className="text-sm text-gray-400">Keine Termine.</p> : (
                <div className="space-y-2">{selectedDayEvents.map(ev => {
                  const time = toDate(ev.startDate).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }); const color = getEventColor(ev, teamMap)
                  return <div key={ev.id} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} /><span className="text-xs text-gray-400">{TYPE_LABELS[ev.type] ?? 'Termin'}</span><span className="text-xs text-gray-400 ml-auto">{time}</span></div>
                    <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                    <div className="flex items-center gap-1.5 mt-2"><Badge variant="success" className="text-[10px]">{ev.responseCount?.accepted ?? 0}</Badge><Badge variant="muted" className="text-[10px]">{ev.responseCount?.declined ?? 0}</Badge></div>
                  </div>
                })}</div>
              )}
            </div>
          ) : <div className="bg-white rounded-lg border p-4 text-center" style={{ borderRadius: '8px' }}><p className="text-sm text-gray-400">Klicke auf einen Tag.</p></div>}
        </div>
      </div>
    </div>
  )
}
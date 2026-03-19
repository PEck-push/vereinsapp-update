'use client'

import { useState, useMemo } from 'react'
import { useEvents } from '@/lib/hooks/useEvents'
import { useTeams } from '@/lib/hooks/useTeams'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { ClubEvent } from '@/lib/types'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const TYPE_COLORS: Record<string, string> = {
  training: '#1a1a2e',
  match: '#e94560',
  meeting: '#3b82f6',
  other: '#6b7280',
}

const TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Spiel',
  meeting: 'Besprechung',
  other: 'Termin',
}

function toDate(d: unknown): Date {
  if (d instanceof Timestamp) return d.toDate()
  if (d instanceof Date) return d
  return new Date(d as string)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

export default function CalendarPage() {
  const { events, loading } = useEvents()
  const { teams } = useTeams()
  const [filterTeam, setFilterTeam] = useState('all')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const filteredEvents = useMemo(() => {
    if (filterTeam === 'all') return events
    return events.filter(e => e.teamIds.includes(filterTeam))
  }, [events, filterTeam])

  const days = getDaysInMonth(year, month)

  // Monday-start: shift so week starts on Monday
  const firstDayOfWeek = (days[0].getDay() + 6) % 7 // 0=Mon
  const paddingBefore = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const d = new Date(year, month, -firstDayOfWeek + i + 1)
    return d
  })

  const allCells = [...paddingBefore, ...days]
  // Pad to full weeks
  const remaining = (7 - (allCells.length % 7)) % 7
  const paddingAfter = Array.from({ length: remaining }, (_, i) => {
    const d = new Date(year, month + 1, i + 1)
    return d
  })
  const grid = [...allCells, ...paddingAfter]

  function getEventsForDay(date: Date): ClubEvent[] {
    return filteredEvents.filter(e => isSameDay(toDate(e.startDate), date))
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  function goToday() {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const today = new Date()
  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold text-gray-900"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          Kalender
        </h1>
        <div className="flex items-center gap-2">
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Alle Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Teams</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              // TODO: Navigate to event creation
            }}
            style={{ backgroundColor: '#e94560', borderRadius: '6px' }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Termin
          </Button>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2
            className="text-lg font-semibold min-w-[200px] text-center"
            style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}
          >
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded-md hover:bg-gray-100"
        >
          Heute
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Calendar Grid */}
          <div className="flex-1 bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b">
              {WEEKDAYS.map(d => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-medium text-gray-400"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7">
              {grid.map((date, i) => {
                const isCurrentMonth = date.getMonth() === month
                const isToday = isSameDay(date, today)
                const isSelected = selectedDate && isSameDay(date, selectedDate)
                const dayEvents = getEventsForDay(date)

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      min-h-[72px] md:min-h-[88px] p-1.5 border-b border-r text-left transition-colors
                      ${!isCurrentMonth ? 'bg-gray-50' : 'hover:bg-gray-50'}
                      ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}
                    `}
                  >
                    <span
                      className={`
                        inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full
                        ${isToday ? 'text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}
                      `}
                      style={isToday ? { backgroundColor: '#e94560' } : {}}
                    >
                      {date.getDate()}
                    </span>
                    {/* Event dots */}
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map(ev => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium truncate"
                          style={{
                            backgroundColor: `${TYPE_COLORS[ev.type] ?? TYPE_COLORS.other}15`,
                            color: TYPE_COLORS[ev.type] ?? TYPE_COLORS.other,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: TYPE_COLORS[ev.type] ?? TYPE_COLORS.other }}
                          />
                          <span className="truncate hidden sm:inline">{ev.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-gray-400 pl-1">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected Day Sidebar */}
          <div className="lg:w-72 shrink-0">
            {selectedDate ? (
              <div className="bg-white rounded-lg border p-4" style={{ borderRadius: '8px' }}>
                <h3
                  className="text-sm font-semibold text-gray-700 mb-3"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {selectedDate.toLocaleDateString('de-AT', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </h3>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Termine an diesem Tag.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEvents.map(ev => {
                      const time = toDate(ev.startDate).toLocaleTimeString('de-AT', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      return (
                        <div
                          key={ev.id}
                          className="p-3 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: TYPE_COLORS[ev.type] ?? TYPE_COLORS.other }}
                            />
                            <span className="text-xs text-gray-400">
                              {TYPE_LABELS[ev.type] ?? 'Termin'}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">{time}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {ev.title}
                          </p>
                          {ev.location && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {ev.location}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge variant="success" className="text-[10px]">
                              {ev.responseCount?.accepted ?? 0}
                            </Badge>
                            <Badge variant="muted" className="text-[10px]">
                              {ev.responseCount?.declined ?? 0}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg border p-4 text-center" style={{ borderRadius: '8px' }}>
                <p className="text-sm text-gray-400">
                  Klicke auf einen Tag um die Termine zu sehen.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[key] }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

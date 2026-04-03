'use client'

import { useMemo } from 'react'
import { useEventResponses, useEvents } from '@/lib/hooks/useEvents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/ui/club-avatar'
import { Loader2, Bell, MoreHorizontal, Check, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Player } from '@/lib/types'

const DECLINE_LABELS: Record<string, string> = {
  injury: 'Verletzung / Krankheit',
  work: 'Arbeit / Schule',
  private: 'Privates',
  other: 'Sonstiges',
}

type Tab = 'accepted' | 'declined' | 'pending'

interface EventResponsePanelProps {
  eventId: string
  allPlayers: Player[]
  eventTeamIds: string[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onSendReminder: (playerId: string) => void
}

export function EventResponsePanel({
  eventId,
  allPlayers,
  eventTeamIds,
  activeTab,
  onTabChange,
  onSendReminder,
}: EventResponsePanelProps) {
  const { responses, loading } = useEventResponses(eventId)
  const { adminSetResponse } = useEvents()

  // Players in this event's teams
  const relevantPlayers = useMemo(
    () => allPlayers.filter((p) => p.teamIds.some((id) => eventTeamIds.includes(id)) && p.status !== 'inactive'),
    [allPlayers, eventTeamIds]
  )

  const responseMap = useMemo(() => {
    const map: Record<string, (typeof responses)[0]> = {}
    for (const r of responses) map[r.id] = r
    return map
  }, [responses])

  const accepted = relevantPlayers.filter((p) => responseMap[p.id]?.status === 'accepted')
  const declined = relevantPlayers.filter((p) => responseMap[p.id]?.status === 'declined')
  const pending = relevantPlayers.filter((p) => !responseMap[p.id])

  function formatTime(ts: unknown): string {
    if (!ts) return ''
    const d = typeof (ts as { toDate?: () => Date }).toDate === 'function'
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string)
    return d.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'accepted', label: 'Zugesagt', count: accepted.length, color: 'text-green-700' },
    { key: 'declined', label: 'Abgesagt', count: declined.length, color: 'text-red-600' },
    { key: 'pending', label: 'Ausstehend', count: pending.length, color: 'text-gray-500' },
  ]

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex border-b mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-[#e94560] text-[#e94560]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`text-xs font-semibold ${t.color}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Accepted Tab */}
      {activeTab === 'accepted' && (
        <div className="space-y-1">
          {accepted.length === 0 && <EmptyState label="Noch keine Zusagen" />}
          {accepted.map((p) => (
            <PlayerRow key={p.id} player={p} trailing={
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{formatTime(responseMap[p.id]?.respondedAt)}</span>
                <AdminOverride playerId={p.id} eventId={eventId} onSet={adminSetResponse} />
              </div>
            } />
          ))}
        </div>
      )}

      {/* Declined Tab */}
      {activeTab === 'declined' && (
        <div className="space-y-1">
          {declined.length === 0 && <EmptyState label="Noch keine Absagen" />}
          {declined.map((p) => {
            const r = responseMap[p.id]
            return (
              <PlayerRow key={p.id} player={p} trailing={
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {r?.declineCategory && (
                    <Badge variant="muted" className="text-xs">
                      {DECLINE_LABELS[r.declineCategory] ?? r.declineCategory}
                    </Badge>
                  )}
                  <AdminOverride playerId={p.id} eventId={eventId} onSet={adminSetResponse} />
                </div>
              }>
                {r?.reason && <p className="text-xs text-gray-400 mt-0.5 pl-9">{r.reason}</p>}
              </PlayerRow>
            )
          })}
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-1">
          {pending.length === 0 && <EmptyState label="Alle haben geantwortet" />}
          {pending.map((p) => (
            <PlayerRow key={p.id} player={p} trailing={
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-gray-500 hover:text-gray-800"
                  onClick={() => onSendReminder(p.id)}
                  title="Erinnerung senden"
                >
                  <Bell className="w-3.5 h-3.5 mr-1" />
                  Erinnern
                </Button>
                <AdminOverride playerId={p.id} eventId={eventId} onSet={adminSetResponse} />
              </div>
            } />
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerRow({
  player,
  trailing,
  children,
}: {
  player: Player
  trailing?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <PlayerAvatar firstName={player.firstName} lastName={player.lastName} size={28} />
        <span className="text-sm text-gray-800 flex-1">
          {player.firstName} {player.lastName}
        </span>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function AdminOverride({
  playerId,
  eventId,
  onSet,
}: {
  playerId: string
  eventId: string
  onSet: (eventId: string, playerId: string, status: 'accepted' | 'declined') => Promise<void>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSet(eventId, playerId, 'accepted')} className="text-green-700">
          <Check className="w-4 h-4 mr-2" />Als Zusage eintragen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSet(eventId, playerId, 'declined')} className="text-red-600">
          <X className="w-4 h-4 mr-2" />Als Absage eintragen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-gray-400 text-center py-4">{label}</p>
}

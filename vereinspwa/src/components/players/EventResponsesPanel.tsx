'use client'

import { useMemo } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { useEventResponses } from '@/lib/hooks/useEvents'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, Loader2, MoreHorizontal } from 'lucide-react'
import type { ClubEvent, EventResponse, Player } from '@/lib/types'

const DECLINE_LABELS: Record<string, string> = {
  injury: 'Verletzung / Krankheit',
  work: 'Arbeit / Schule',
  private: 'Privates',
  other: 'Sonstiges',
}

interface EventResponsesPanelProps {
  event: ClubEvent
  players: Player[]
  onSendReminder: (playerId: string) => Promise<void>
}

export function EventResponsesPanel({
  event,
  players,
  onSendReminder,
}: EventResponsesPanelProps) {
  const { responses, loading } = useEventResponses(event.id)

  // Map responses by playerId for quick lookup
  const responseMap = useMemo(
    () => new Map(responses.map((r) => [r.id, r])),
    [responses]
  )

  const accepted = players.filter((p) => responseMap.get(p.id)?.status === 'accepted')
  const declined = players.filter((p) => responseMap.get(p.id)?.status === 'declined')
  const pending  = players.filter((p) => !responseMap.has(p.id))

  async function manualOverride(
    playerId: string,
    status: 'accepted' | 'declined'
  ) {
    const ref = doc(db, 'clubs', CLUB_ID, 'events', event.id, 'responses', playerId)
    await setDoc(
      ref,
      {
        playerId,
        status,
        source: 'pwa',
        respondedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mt-4">
      <Tabs defaultValue="accepted">
        <TabsList className="w-full">
          <TabsTrigger value="accepted" className="flex-1">
            Zusagen
            <span className="ml-1.5 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
              {accepted.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="declined" className="flex-1">
            Absagen
            <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
              {declined.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1">
            Ausstehend
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Zugesagt */}
        <TabsContent value="accepted">
          <PlayerList
            players={accepted}
            eventId={event.id}
            responseMap={responseMap}
            renderExtra={(p) => {
              const resp = responseMap.get(p.id)
              return (
                <span className="text-xs text-gray-400">
                  {resp?.respondedAt
                    ? new Date(
                        (resp.respondedAt as unknown as { toDate: () => Date }).toDate?.() ?? resp.respondedAt
                      ).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
                    : ''}
                </span>
              )
            }}
            onOverride={(id) => manualOverride(id, 'declined')}
            overrideLabel="Als Absage eintragen"
          />
        </TabsContent>

        {/* Abgesagt */}
        <TabsContent value="declined">
          <PlayerList
            players={declined}
            eventId={event.id}
            responseMap={responseMap}
            renderExtra={(p) => {
              const resp = responseMap.get(p.id)
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {resp?.declineCategory && (
                    <Badge variant="muted" className="text-xs">
                      {DECLINE_LABELS[resp.declineCategory]}
                    </Badge>
                  )}
                  {resp?.reason && (
                    <span className="text-xs text-gray-400 italic">
                      &bdquo;{resp.reason}&ldquo;
                    </span>
                  )}
                </div>
              )
            }}
            onOverride={(id) => manualOverride(id, 'accepted')}
            overrideLabel="Als Zusage eintragen"
          />
        </TabsContent>

        {/* Ausstehend */}
        <TabsContent value="pending">
          <PlayerList
            players={pending}
            eventId={event.id}
            responseMap={responseMap}
            renderExtra={(p) => (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-gray-500 hover:text-gray-800"
                onClick={() => onSendReminder(p.id)}
              >
                <Bell className="w-3 h-3 mr-1" />
                Erinnerung
              </Button>
            )}
            onOverride={(id) => manualOverride(id, 'accepted')}
            overrideLabel="Als Zusage eintragen"
            overrideLabel2="Als Absage eintragen"
            onOverride2={(id) => manualOverride(id, 'declined')}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── PlayerList ───────────────────────────────────────────────────────────────
function PlayerList({
  players,
  renderExtra,
  onOverride,
  overrideLabel,
  onOverride2,
  overrideLabel2,
}: {
  players: Player[]
  eventId: string
  responseMap: Map<string, EventResponse & { id: string }>
  renderExtra: (p: Player) => React.ReactNode
  onOverride: (id: string) => void
  overrideLabel: string
  onOverride2?: (id: string) => void
  overrideLabel2?: string
}) {
  if (players.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">Keine Einträge</p>
  }

  return (
    <div className="divide-y mt-1">
      {players.map((player) => (
        <div key={player.id} className="flex items-center gap-3 py-2.5">
          {/* Avatar initials */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            {player.firstName[0]}{player.lastName[0]}
          </div>

          {/* Name + extra info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {player.firstName} {player.lastName}
            </p>
            <div className="mt-0.5">{renderExtra(player)}</div>
          </div>

          {/* Three-dot menu for manual override */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOverride(player.id)}>
                {overrideLabel}
              </DropdownMenuItem>
              {onOverride2 && overrideLabel2 && (
                <DropdownMenuItem onClick={() => onOverride2(player.id)}>
                  {overrideLabel2}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}
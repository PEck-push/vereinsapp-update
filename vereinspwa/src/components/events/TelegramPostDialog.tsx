'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Loader2, Send } from 'lucide-react'
import type { ClubEvent } from '@/lib/types'

interface TelegramGroup {
  teamId: string
  teamName: string
  teamColor: string
  groupId: number
}

interface PostResult {
  teamName: string
  success: boolean
  error?: string
}

interface TelegramPostDialogProps {
  open: boolean
  onClose: () => void
  event: ClubEvent | null
}

export function TelegramPostDialog({ open, onClose, event }: TelegramPostDialogProps) {
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [posting, setPosting] = useState(false)
  const [results, setResults] = useState<PostResult[] | null>(null)

  // Load linked Telegram groups
  useEffect(() => {
    if (!open) return
    setResults(null)
    setPosting(false)

    async function loadGroups() {
      setLoading(true)
      try {
        const teamsSnap = await getDocs(collection(db, 'clubs', CLUB_ID, 'teams'))
        const linked: TelegramGroup[] = []

        teamsSnap.docs.forEach(doc => {
          const data = doc.data()
          if (data.telegramGroupId) {
            linked.push({
              teamId: doc.id,
              teamName: data.name,
              teamColor: data.color ?? '#1a1a2e',
              groupId: data.telegramGroupId,
            })
          }
        })

        setGroups(linked)

        // Auto-select groups that match the event's teams
        if (event) {
          const autoSelect = linked
            .filter(g => event.teamIds.includes(g.teamId) || event.teamIds.length === 0)
            .map(g => g.groupId)
          setSelected(autoSelect)
        }
      } finally {
        setLoading(false)
      }
    }

    loadGroups()
  }, [open, event])

  function toggleGroup(groupId: number) {
    setSelected(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  function selectAll() {
    setSelected(groups.map(g => g.groupId))
  }

  function selectNone() {
    setSelected([])
  }

  async function handlePost() {
    if (!event || selected.length === 0) return
    setPosting(true)
    setResults(null)

    try {
      const res = await fetch('/api/telegram/post-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, groupIds: selected }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResults([{ teamName: 'Fehler', success: false, error: data.error }])
        return
      }

      setResults(data.results)
    } catch {
      setResults([{ teamName: 'Fehler', success: false, error: 'Verbindungsfehler' }])
    } finally {
      setPosting(false)
    }
  }

  if (!event) return null

  return (
    <Dialog open={open} onOpenChange={o => !o && !posting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
            In Telegram posten
          </DialogTitle>
        </DialogHeader>

        {/* Event preview */}
        <div className="bg-gray-50 rounded-lg p-3 border">
          <p className="text-sm font-medium text-gray-900">{event.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(event.startDate as unknown as string).toLocaleDateString?.('de-AT', {
              weekday: 'short', day: 'numeric', month: 'short',
            }) ?? ''}
          </p>
        </div>

        {results ? (
          /* ── Results ── */
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-gray-50">
                {r.success ? (
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <span className="w-4 h-4 text-red-500 shrink-0 text-center font-bold">!</span>
                )}
                <span className="text-sm text-gray-800 flex-1">{r.teamName}</span>
                {r.success ? (
                  <Badge variant="success" className="text-[10px]">Gesendet</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">{r.error ?? 'Fehler'}</Badge>
                )}
              </div>
            ))}
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onClose}>Schließen</Button>
            </DialogFooter>
          </div>
        ) : loading ? (
          /* ── Loading ── */
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : groups.length === 0 ? (
          /* ── No groups ── */
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm">Keine Telegram-Gruppen verknüpft.</p>
            <p className="text-xs mt-1">
              Füge den Bot zu einer Telegram-Gruppe hinzu und verwende <code>/setup Teamname</code>.
            </p>
          </div>
        ) : (
          /* ── Group selection ── */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Gruppen auswählen</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">Alle</button>
                <span className="text-xs text-gray-300">|</span>
                <button onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-700">Keine</button>
              </div>
            </div>

            <div className="space-y-1.5">
              {groups.map(group => {
                const isSelected = selected.includes(group.groupId)
                const isEventTeam = event.teamIds.includes(group.teamId) || event.teamIds.length === 0
                return (
                  <button
                    key={group.groupId}
                    onClick={() => toggleGroup(group.groupId)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={{ borderRadius: '8px' }}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>

                    {/* Team color dot */}
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.teamColor }} />

                    {/* Team name */}
                    <span className="text-sm font-medium text-gray-800 flex-1">{group.teamName}</span>

                    {/* Indicator if this is the event's team */}
                    {isEventTeam && (
                      <Badge variant="muted" className="text-[10px]">Event-Team</Badge>
                    )}
                  </button>
                )
              })}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button
                onClick={handlePost}
                disabled={selected.length === 0 || posting}
                variant="club"
              >
                {posting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sende...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" />An {selected.length} {selected.length === 1 ? 'Gruppe' : 'Gruppen'} senden</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
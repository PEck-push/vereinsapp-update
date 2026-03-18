'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toaster'
import { Bell, Loader2, Send, Users, X } from 'lucide-react'
import type { Player } from '@/lib/types'

type RecipientMode = 'all' | 'teams' | 'individual'

interface SentMessage {
  id: string
  subject: string
  body: string
  recipientMode: RecipientMode
  teamIds: string[]
  playerIds: string[]
  sentCount: number
  totalCount: number
  sentAt: Date
  sentBy: string
}

export default function MessagesPage() {
  const { teams } = useTeams()
  const { players } = usePlayers()
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Nachrichten
        </h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['compose', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              {tab === 'compose' ? 'Verfassen' : 'Verlauf'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'compose' ? (
        <ComposePanel teams={teams} players={players.filter(p => p.status !== 'inactive')} />
      ) : (
        <HistoryPanel />
      )}
    </div>
  )
}

// ─── Compose Panel ────────────────────────────────────────────────────────────
function ComposePanel({
  teams,
  players,
}: {
  teams: ReturnType<typeof useTeams>['teams']
  players: Player[]
}) {
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)

  const activePlayers = players.filter(p => p.status !== 'inactive')

  const recipientPlayers = useMemo(() => {
    if (recipientMode === 'all') return activePlayers
    if (recipientMode === 'teams')
      return activePlayers.filter(p => selectedTeamIds.some(id => p.teamIds.includes(id)))
    return activePlayers.filter(p => selectedPlayerIds.includes(p.id))
  }, [recipientMode, selectedTeamIds, selectedPlayerIds, activePlayers])

  const filteredPlayerSearch = activePlayers.filter(p =>
    playerSearch &&
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearch.toLowerCase()) &&
    !selectedPlayerIds.includes(p.id)
  ).slice(0, 8)

  function addPlayer(id: string) {
    setSelectedPlayerIds(prev => [...prev, id])
    setPlayerSearch('')
  }

  function removePlayer(id: string) {
    setSelectedPlayerIds(prev => prev.filter(p => p !== id))
  }

  function getPlayerName(id: string) {
    const p = activePlayers.find(pl => pl.id === id)
    return p ? `${p.firstName} ${p.lastName}` : id
  }

  const canSend = subject.trim() && body.trim() && recipientPlayers.length > 0

  async function handleSend() {
    setSending(true)
    try {
      const playerIds = recipientPlayers.map(p => p.id)

      // Send push notifications
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerIds,
          title: subject,
          body,
          clubId: CLUB_ID,
          url: '/mein-bereich',
        }),
      })

      const result = await res.json()

      // Save to messages history
      await addDoc(collection(db, 'clubs', CLUB_ID, 'messages'), {
        subject,
        body,
        recipientMode,
        teamIds: selectedTeamIds,
        playerIds,
        sentCount: result.sent ?? 0,
        totalCount: playerIds.length,
        sentAt: serverTimestamp(),
        sentBy: auth.currentUser?.uid ?? 'unknown',
      })

      toast.success('Nachricht gesendet', `${result.sent} von ${playerIds.length} Personen erreicht`)
      setSubject('')
      setBody('')
      setSelectedTeamIds([])
      setSelectedPlayerIds([])
      setShowConfirm(false)
    } catch {
      toast.error('Senden fehlgeschlagen', 'Bitte nochmals versuchen.')
    } finally {
      setSending(false)
    }
  }

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name, color: t.color }))

  return (
    <div className="max-w-2xl space-y-5">
      {/* Empfänger */}
      <div className="bg-white rounded-lg border p-5 space-y-4" style={{ borderRadius: '8px' }}>
        <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Empfänger
        </h2>

        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'all', label: `Alle (${activePlayers.length})` },
            { value: 'teams', label: 'Mannschaft(en)' },
            { value: 'individual', label: 'Einzelne Spieler' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setRecipientMode(opt.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                recipientMode === opt.value
                  ? 'text-white border-transparent'
                  : 'text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              style={recipientMode === opt.value ? { backgroundColor: '#1a1a2e' } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {recipientMode === 'teams' && (
          <MultiSelect
            options={teamOptions}
            value={selectedTeamIds}
            onChange={setSelectedTeamIds}
            placeholder="Teams auswählen..."
          />
        )}

        {recipientMode === 'individual' && (
          <div className="space-y-2">
            {/* Chips */}
            {selectedPlayerIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedPlayerIds.map(id => (
                  <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
                    {getPlayerName(id)}
                    <button onClick={() => removePlayer(id)}><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
            {/* Search */}
            <div className="relative">
              <Input
                placeholder="Spieler suchen..."
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
              />
              {filteredPlayerSearch.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg">
                  {filteredPlayerSearch.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPlayer(p.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {p.firstName} {p.lastName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {recipientPlayers.length > 0 && (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-800">{recipientPlayers.length}</span> Empfänger ausgewählt
          </p>
        )}
      </div>

      {/* Kanal */}
      <div className="bg-white rounded-lg border p-5 space-y-3" style={{ borderRadius: '8px' }}>
        <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Kanal
        </h2>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[#e94560]" />
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-800">Push Notification</span>
            </div>
          </label>
          <label className="flex items-center gap-3 opacity-50 cursor-not-allowed">
            <input type="checkbox" disabled className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-500">E-Mail <span className="text-xs">(folgt in einer späteren Version)</span></span>
          </label>
        </div>
      </div>

      {/* Inhalt */}
      <div className="bg-white rounded-lg border p-5 space-y-4" style={{ borderRadius: '8px' }}>
        <h2 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Inhalt
        </h2>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor="subject">Betreff *</Label>
            <span className="text-xs text-gray-400">{subject.length}/80</span>
          </div>
          <Input
            id="subject"
            value={subject}
            onChange={e => setSubject(e.target.value.slice(0, 80))}
            placeholder="z.B. Trainingsausfall am Freitag"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor="body">Nachricht *</Label>
            <span className="text-xs text-gray-400">{body.length}/500</span>
          </div>
          <textarea
            id="body"
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 500))}
            placeholder="Deine Nachricht..."
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Preview */}
      {showPreview && subject && body && (
        <div className="bg-gray-800 rounded-xl p-4 text-white">
          <p className="text-xs text-gray-400 mb-2">Push Notification Vorschau</p>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-white/20" />
              <span className="text-xs text-gray-300">Vereinsmanager</span>
            </div>
            <p className="text-sm font-semibold">{subject}</p>
            <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{body}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setShowPreview(p => !p)}
          disabled={!subject && !body}
        >
          {showPreview ? 'Vorschau ausblenden' : 'Vorschau'}
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={!canSend}
          style={{ backgroundColor: '#e94560' }}
        >
          <Send className="w-4 h-4 mr-2" />
          Senden
        </Button>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nachricht senden?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Diese Nachricht wird als Push Notification an{' '}
            <strong>{recipientPlayers.length} {recipientPlayers.length === 1 ? 'Person' : 'Personen'}</strong> gesendet.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-800">{subject}</p>
            <p className="text-gray-500 mt-1 text-xs line-clamp-3">{body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Abbrechen</Button>
            <Button onClick={handleSend} disabled={sending} style={{ backgroundColor: '#e94560' }}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Jetzt senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── History Panel ────────────────────────────────────────────────────────────
function HistoryPanel() {
  const [messages, setMessages] = useState<SentMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        query(collection(db, 'clubs', CLUB_ID, 'messages'), orderBy('sentAt', 'desc'))
      )
      setMessages(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        sentAt: d.data().sentAt instanceof Timestamp ? d.data().sentAt.toDate() : new Date(),
      }) as SentMessage))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
    </div>
  )

  if (messages.length === 0) return (
    <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
      <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Noch keine Nachrichten gesendet.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderRadius: '8px' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Betreff</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Empfänger</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Zugestellt</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Datum</th>
          </tr>
        </thead>
        <tbody>
          {messages.map(m => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{m.subject}</td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {m.recipientMode === 'all' ? 'Alle Spieler' : `${m.totalCount} Spieler`}
              </td>
              <td className="px-4 py-3 text-center">
                <Badge variant={m.sentCount === m.totalCount ? 'success' : 'warning'}>
                  {m.sentCount}/{m.totalCount}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right text-gray-400 text-xs hidden md:table-cell">
                {m.sentAt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

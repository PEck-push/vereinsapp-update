'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID, APP_URL } from '@/lib/config'
import { useTeams } from '@/lib/hooks/useTeams'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import type { Player } from '@/lib/types'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const STATUS_BADGE: Record<
  Player['status'],
  { label: string; variant: 'success' | 'warning' | 'muted' }
> = {
  active: { label: 'Aktiv', variant: 'success' },
  injured: { label: 'Verletzt', variant: 'warning' },
  inactive: { label: 'Inaktiv', variant: 'muted' },
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { teams } = useTeams()

  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [plainToken, setPlainToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const ref = doc(db, 'clubs', CLUB_ID, 'players', id)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as Player)
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function generateInviteToken() {
    if (!player) return
    setGeneratingToken(true)
    try {
      const token = crypto.randomUUID()
      const hash = await sha256(token)
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // +24h

      const ref = doc(db, 'clubs', CLUB_ID, 'players', player.id)
      await updateDoc(ref, {
        inviteToken: hash,
        inviteTokenExpiry: expiry,
        inviteTokenUsed: false,
        accountStatus: 'invited',
        updatedAt: serverTimestamp(),
      })

      // Show plain token ONCE – never stored
      setPlainToken(token)
      setPlayer((prev) =>
        prev
          ? { ...prev, inviteTokenUsed: false, accountStatus: 'invited' }
          : prev
      )
    } finally {
      setGeneratingToken(false)
    }
  }

  async function copyLink() {
    if (!plainToken) return
    await navigator.clipboard.writeText(`${APP_URL}/invite/${plainToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getTeamNames(teamIds: string[]) {
    return teamIds
      .map((id) => teams.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(', ') || '–'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!player) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Spieler nicht gefunden.</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          Zurück
        </Button>
      </div>
    )
  }

  const statusInfo = STATUS_BADGE[player.status]
  const inviteLink = plainToken ? `${APP_URL}/invite/${plainToken}` : null
  const isRegistered = player.accountStatus === 'active'

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück zur Übersicht
      </button>

      {/* Header */}
      <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold text-lg shrink-0"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            {player.firstName[0]}{player.lastName[0]}
          </div>
          <div className="flex-1">
            <h1
              className="text-xl font-semibold text-gray-900"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              {player.firstName} {player.lastName}
              {player.jerseyNumber && (
                <span className="ml-2 text-base font-normal text-gray-400">
                  #{player.jerseyNumber}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {player.position && (
                <span className="text-sm text-gray-500">{player.position}</span>
              )}
              {player.position && <span className="text-gray-300">·</span>}
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-lg border p-6 mb-4" style={{ borderRadius: '8px' }}>
        <h2
          className="text-sm font-semibold text-gray-700 mb-4"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          Kontakt & Details
        </h2>
        <div className="space-y-3">
          <InfoRow label="E-Mail" value={player.email} />
          <InfoRow label="Telefon" value={player.phone ?? '–'} />
          <InfoRow
            label="Geburtsdatum"
            value={
              player.dateOfBirth
                ? new Date(player.dateOfBirth).toLocaleDateString('de-AT')
                : '–'
            }
          />
          <InfoRow label="Teams" value={getTeamNames(player.teamIds)} />
        </div>
      </div>

      {/* Invite Section */}
      <div className="bg-white rounded-lg border p-6" style={{ borderRadius: '8px' }}>
        <h2
          className="text-sm font-semibold text-gray-700 mb-1"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          App-Zugang
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          {isRegistered
            ? 'Spieler hat sich bereits registriert.'
            : player.accountStatus === 'invited'
            ? 'Einladung wurde gesendet – noch nicht registriert.'
            : 'Noch kein Einladungslink generiert.'}
        </p>

        {isRegistered ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">
            <Check className="w-4 h-4" />
            Registriert
          </div>
        ) : (
          <>
            <Button
              onClick={generateInviteToken}
              disabled={generatingToken}
              variant="outline"
              className="mb-4"
            >
              {generatingToken ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {player.accountStatus === 'invited'
                ? 'Link neu generieren'
                : 'Einladungslink generieren'}
            </Button>

            {inviteLink && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2 border">
                  <code className="text-xs text-gray-600 flex-1 truncate">
                    {inviteLink}
                  </code>
                  <button
                    onClick={copyLink}
                    className="text-gray-400 hover:text-gray-700 shrink-0"
                    title="Link kopieren"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <ClipboardCopy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Dieser Link ist <strong>24 Stunden gültig</strong> und kann nur{' '}
                    <strong>einmal verwendet</strong> werden. Nach dem Schließen dieser
                    Seite ist er nicht mehr sichtbar.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

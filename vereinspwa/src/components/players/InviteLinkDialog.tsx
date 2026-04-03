'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  X,
} from 'lucide-react'

interface InviteResult {
  playerName: string
  inviteUrl: string
  expiresAt?: string
  playerEmail?: string
  emailSent?: boolean
}

interface InviteLinkDialogProps {
  open: boolean
  onClose: () => void
  /** Single invite result */
  invite?: InviteResult | null
  /** Bulk invite results */
  bulkInvites?: InviteResult[]
  /** Loading state while generating */
  loading?: boolean
}

export function InviteLinkDialog({
  open,
  onClose,
  invite,
  bulkInvites,
  loading,
}: InviteLinkDialogProps) {
  const isBulk = !!bulkInvites && bulkInvites.length > 0
  const invites = isBulk ? bulkInvites : invite ? [invite] : []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>
            {loading
              ? 'Einladung wird generiert…'
              : isBulk
              ? `${invites.length} Einladungen`
              : '🔗 Einladungslink'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Kein Einladungslink verfügbar.</p>
        ) : isBulk ? (
          <BulkInviteList invites={invites} />
        ) : (
          <SingleInvite invite={invites[0]} />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Single Invite ────────────────────────────────────────────────────────────

function SingleInvite({ invite }: { invite: InviteResult }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard.writeText(invite.inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function shareWhatsApp() {
    const text = `Hallo ${invite.playerName}! Registriere dich jetzt in unserer Vereins-App: ${invite.inviteUrl}`
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    )
  }

  function shareTelegram() {
    const text = `Hallo ${invite.playerName}! Registriere dich jetzt in unserer Vereins-App: ${invite.inviteUrl}`
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(invite.inviteUrl)}&text=${encodeURIComponent(`Hallo ${invite.playerName}! Registriere dich jetzt in unserer Vereins-App.`)}`,
      '_blank'
    )
  }

  const expiryDate = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString('de-AT', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-sm text-green-800">
          Einladung für <strong>{invite.playerName}</strong> wurde erstellt.
        </p>
        {invite.emailSent && invite.playerEmail && (
          <p className="text-xs text-green-600 mt-1">
            ✉️ E-Mail wird gesendet an {invite.playerEmail}
          </p>
        )}
      </div>

      {/* Link display + copy */}
      <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2.5 border">
        <code className="text-xs text-gray-600 flex-1 truncate select-all">
          {invite.inviteUrl}
        </code>
        <button
          onClick={copyLink}
          className="text-gray-400 hover:text-gray-700 shrink-0 p-1"
          title="Link kopieren"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <ClipboardCopy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={copyLink}
          className="flex-1"
        >
          {copied ? (
            <Check className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <ClipboardCopy className="w-4 h-4 mr-2" />
          )}
          {copied ? 'Kopiert!' : 'Link kopieren'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={shareWhatsApp}
          className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          WhatsApp
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={shareTelegram}
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
        >
          <Send className="w-4 h-4 mr-1" />
        </Button>
      </div>

      {/* Expiry info */}
      {expiryDate && (
        <p className="text-xs text-gray-400">
          Gültig bis {expiryDate} · Kann nur einmal verwendet werden.
        </p>
      )}
    </div>
  )
}

// ─── Bulk Invites ─────────────────────────────────────────────────────────────

function BulkInviteList({ invites }: { invites: InviteResult[] }) {
  const [copiedAll, setCopiedAll] = useState(false)

  async function copyAll() {
    const text = invites
      .map((inv) => `${inv.playerName}: ${inv.inviteUrl}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 3000)
  }

  function shareAllWhatsApp() {
    // WhatsApp has a text limit, so just provide a summary
    const text = invites
      .map((inv) => `${inv.playerName}: ${inv.inviteUrl}`)
      .join('\n')
    window.open(
      `https://wa.me/?text=${encodeURIComponent('Einladungslinks:\n\n' + text)}`,
      '_blank'
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-sm text-green-800">
          <strong>{invites.length}</strong> Einladungen erstellt.
        </p>
      </div>

      {/* List */}
      <div className="max-h-60 overflow-y-auto space-y-1.5">
        {invites.map((inv, i) => (
          <BulkInviteRow key={i} invite={inv} />
        ))}
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={copyAll}
          className="flex-1"
        >
          {copiedAll ? (
            <Check className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <ClipboardCopy className="w-4 h-4 mr-2" />
          )}
          {copiedAll ? 'Kopiert!' : 'Alle Links kopieren'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={shareAllWhatsApp}
          className="text-green-700 border-green-200 hover:bg-green-50"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          WhatsApp
        </Button>
      </div>
    </div>
  )
}

function BulkInviteRow({ invite }: { invite: InviteResult }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(invite.inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50">
      <span className="text-sm font-medium text-gray-800 flex-1 truncate">
        {invite.playerName}
      </span>
      <button
        onClick={copy}
        className="text-gray-400 hover:text-gray-700 shrink-0 p-1"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <ClipboardCopy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}

// ─── Admin Credentials Dialog ─────────────────────────────────────────────────

interface AdminCredentials {
  email: string
  password: string
  role: string
  displayName?: string
}

interface AdminCredentialsDialogProps {
  open: boolean
  onClose: () => void
  credentials: AdminCredentials | null
}

export function AdminCredentialsDialog({
  open,
  onClose,
  credentials,
}: AdminCredentialsDialogProps) {
  const [copied, setCopied] = useState(false)

  if (!credentials) return null

  async function copyCredentials() {
    const text = [
      `Dein Zugang zur Vereins-App:`,
      ``,
      `E-Mail: ${credentials!.email}`,
      `Passwort: ${credentials!.password}`,
      ``,
      `Login: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`,
    ].join('\n')

    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  function shareWhatsApp() {
    const text = [
      `Dein Zugang zur Vereins-App:`,
      ``,
      `E-Mail: ${credentials!.email}`,
      `Passwort: ${credentials!.password}`,
      ``,
      `Login: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`,
      ``,
      `Bitte ändere dein Passwort nach dem ersten Login.`,
    ].join('\n')

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    trainer: 'Trainer',
    secretary: 'Sekretär',
    funktionaer: 'Funktionär',
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
            ✅ Benutzer erstellt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              <strong>{credentials.displayName || credentials.email}</strong> wurde als{' '}
              <Badge variant="secondary" className="text-xs">
                {ROLE_LABELS[credentials.role] ?? credentials.role}
              </Badge>{' '}
              angelegt.
            </p>
          </div>

          {/* Credentials display */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 border">
            <div className="flex justify-between">
              <span className="text-xs text-gray-400">E-Mail</span>
              <code className="text-sm text-gray-800 select-all">{credentials.email}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-400">Passwort</span>
              <code className="text-sm text-gray-800 select-all">{credentials.password}</code>
            </div>
          </div>

          <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-md">
            ⚠️ Das Passwort wird nur jetzt angezeigt. Leite die Zugangsdaten
            jetzt an die Person weiter.
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyCredentials}
              className="flex-1"
            >
              {copied ? (
                <Check className="w-4 h-4 mr-2 text-green-500" />
              ) : (
                <ClipboardCopy className="w-4 h-4 mr-2" />
              )}
              {copied ? 'Kopiert!' : 'Zugangsdaten kopieren'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={shareWhatsApp}
              className="text-green-700 border-green-200 hover:bg-green-50"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
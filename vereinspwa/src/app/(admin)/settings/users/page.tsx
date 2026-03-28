'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTeams } from '@/lib/hooks/useTeams'
import { AdminCredentialsDialog } from '@/components/players/InviteLinkDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toaster'
import { AlertCircle, ArrowLeft, Loader2, MoreHorizontal, Plus, Shield, Trash2, UserPlus, Users } from 'lucide-react'

interface AdminUser {
  uid: string
  email: string
  displayName: string
  role: string
  teamIds: string[]
  createdAt: string | null
}

const ROLE_INFO: Record<string, { label: string; description: string; color: string }> = {
  admin: { label: 'Admin', description: 'Voller Zugriff auf alles', color: '#DC2626' },
  funktionaer: { label: 'Funktionär', description: 'Alles sehen, Termine anlegen', color: '#8B5CF6' },
  trainer: { label: 'Trainer', description: 'Nur zugewiesene Mannschaften', color: '#3B82F6' },
  secretary: { label: 'Sekretär', description: 'Voller Zugriff, Admin-ähnlich', color: '#10B981' },
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { teams } = useTeams()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Credentials Dialog ──
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string
    password: string
    role: string
    displayName?: string
  } | null>(null)

  async function loadUsers() {
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch {
      setLoadError(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadUsers() }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: deleteTarget.uid }),
      })
      if (!res.ok) throw new Error()
      toast.success('Benutzer entfernt')
      setDeleteTarget(null)
      loadUsers()
    } catch { toast.error('Löschen fehlgeschlagen') }
    finally { setDeleting(false) }
  }

  function handleUserCreated(credentials: { email: string; password: string; role: string; displayName?: string }) {
    setCreateOpen(false)
    setCreatedCredentials(credentials)
    setCredentialsDialogOpen(true)
    loadUsers()
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.push('/settings')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft className="w-4 h-4" /> Zurück zu Einstellungen
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Benutzer & Rollen</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admins, Trainer und Funktionäre verwalten</p>
        </div>
        <Button variant="club" onClick={() => setCreateOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Benutzer anlegen
        </Button>
      </div>

      {/* Role Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(ROLE_INFO).map(([key, info]) => (
          <div key={key} className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: info.color }} />
            <span className="font-medium text-gray-700">{info.label}</span>
            <span className="hidden sm:inline">— {info.description}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : loadError ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Benutzer konnten nicht geladen werden.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); loadUsers() }}>Erneut versuchen</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium text-gray-600">Noch keine Benutzer angelegt</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">Erstelle Admin-, Trainer- oder Funktionär-Accounts.</p>
          <Button variant="club" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Ersten Benutzer anlegen
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const roleInfo = ROLE_INFO[user.role] ?? ROLE_INFO.admin
            return (
              <div key={user.uid} className="flex items-center gap-4 p-4 bg-white rounded-lg border" style={{ borderRadius: '8px' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0" style={{ backgroundColor: roleInfo.color }}>
                  {(user.displayName || user.email || '??').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.displayName || user.email}</p>
                    <Badge className="text-[10px]" style={{ backgroundColor: `${roleInfo.color}15`, color: roleInfo.color, border: 'none' }}>{roleInfo.label}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  {user.role === 'trainer' && user.teamIds.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <Users className="w-3 h-3 text-gray-300" />
                      {user.teamIds.map(id => {
                        const team = teams.find(t => t.id === id)
                        if (!team) return null
                        return <span key={id} className="flex items-center gap-1 text-xs text-gray-500"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: team.color }} />{team.name}</span>
                      })}
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDeleteTarget(user)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                      <Trash2 className="w-4 h-4 mr-2" /> Entfernen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}

      <CreateAdminDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        teams={teams}
        onCreated={handleUserCreated}
      />

      {/* Credentials Dialog — shows after successful creation */}
      <AdminCredentialsDialog
        open={credentialsDialogOpen}
        onClose={() => { setCredentialsDialogOpen(false); setCreatedCredentials(null) }}
        credentials={createdCredentials}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Benutzer entfernen?</DialogTitle>
            <DialogDescription>Die Admin-Rechte werden entfernt. Der Login-Account bleibt bestehen.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600"><strong>{deleteTarget?.displayName || deleteTarget?.email}</strong> verliert alle Verwaltungsrechte.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Entfernen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Create Admin Dialog ──────────────────────────────────────────────────────

function CreateAdminDialog({ open, onClose, teams, onCreated }: {
  open: boolean
  onClose: () => void
  teams: ReturnType<typeof useTeams>['teams']
  onCreated: (credentials: { email: string; password: string; role: string; displayName?: string }) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('trainer')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setEmail(''); setPassword(''); setDisplayName(''); setRole('trainer'); setTeamIds([]); setError(null) }
  function handleClose() { reset(); onClose() }

  async function handleSubmit() {
    setError(null)
    if (!email || !password) { setError('E-Mail und Passwort sind Pflichtfelder.'); return }
    if (password.length < 8) { setError('Passwort muss mindestens 8 Zeichen haben.'); return }
    if (role === 'trainer' && teamIds.length === 0) { setError('Trainer benötigt mindestens ein Team.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName.trim() || undefined, role, teamIds: role === 'trainer' ? teamIds : [] }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Fehler beim Erstellen'); return }

      // Pass credentials to parent so it can show the credentials dialog
      onCreated({
        email,
        password,
        role,
        displayName: displayName.trim() || undefined,
      })
      reset()
    } catch { setError('Benutzer konnte nicht erstellt werden.') }
    finally { setSubmitting(false) }
  }

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name, color: t.color }))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>Neuen Benutzer anlegen</DialogTitle>
          <DialogDescription>Erstelle einen Admin-, Trainer- oder Funktionär-Account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="z.B. Max Mustermann" /></div>
          <div className="space-y-1.5"><Label>E-Mail *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="trainer@verein.at" /></div>
          <div className="space-y-1.5"><Label>Passwort *</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 Zeichen" /></div>
          <div className="space-y-1.5">
            <Label>Rolle *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: info.color }} />
                      {info.label} <span className="text-xs text-gray-400 ml-1">— {info.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === 'trainer' && (
            <div className="space-y-1.5">
              <Label>Mannschaften *</Label>
              <MultiSelect options={teamOptions} value={teamIds} onChange={setTeamIds} placeholder="Team(s) auswählen" />
              <p className="text-xs text-gray-400">Trainer sehen nur diese Mannschaften.</p>
            </div>
          )}
          {error && <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
          <Button variant="club" onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
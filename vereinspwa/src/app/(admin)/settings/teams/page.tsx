'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Controller } from 'react-hook-form'
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import type { Team } from '@/lib/types'

const teamSchema = z.object({
  name: z.string().min(2, 'Mindestens 2 Zeichen'),
  category: z.enum(['senior', 'youth', 'ladies', 'other']),
  color: z.string().min(4, 'Farbe wählen'),
})

type TeamFormValues = z.infer<typeof teamSchema>

const CATEGORY_LABELS: Record<Team['category'], string> = {
  senior: 'Herren',
  youth: 'Jugend',
  ladies: 'Damen',
  other: 'Sonstige',
}

export default function TeamsPage() {
  const { teams, loading, addTeam, updateTeam, deleteTeam } = useTeams()
  const { players } = usePlayers()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', category: 'senior', color: '#1a1a2e' },
  })

  function openCreate() {
    setEditingTeam(null)
    reset({ name: '', category: 'senior', color: '#1a1a2e' })
    setDialogOpen(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    reset({ name: team.name, category: team.category, color: team.color })
    setDialogOpen(true)
  }

  async function onSubmit(data: TeamFormValues) {
    if (editingTeam) {
      await updateTeam(editingTeam.id, data)
    } else {
      await addTeam(data)
    }
    setDialogOpen(false)
  }

  async function handleDelete(team: Team) {
    setDeleteError(null)
    try {
      await deleteTeam(team.id)
      setDeleteTarget(null)
    } catch (e) {
      setDeleteError((e as Error).message)
    }
  }

  function playerCount(teamId: string) {
    return players.filter(
      (p) => p.teamIds.includes(teamId) && p.status !== 'inactive'
    ).length
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-semibold text-gray-900"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Mannschaften
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {teams.length} {teams.length === 1 ? 'Mannschaft' : 'Mannschaften'}
          </p>
        </div>
        <Button
          onClick={openCreate}
          style={{ backgroundColor: '#e94560', borderRadius: '6px' }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Team anlegen
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Noch keine Mannschaften angelegt.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map((team) => {
            const count = playerCount(team.id)
            return (
              <div
                key={team.id}
                className="flex items-center gap-4 p-4 bg-white rounded-lg border"
                style={{ borderRadius: '8px' }}
              >
                {/* Color swatch */}
                <div
                  className="w-3 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: team.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{team.name}</p>
                  <p className="text-xs text-gray-500">
                    {CATEGORY_LABELS[team.category]} · {count}{' '}
                    {count === 1 ? 'Spieler' : 'Spieler'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(team)}
                    className="h-8 w-8 text-gray-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteTarget(team)
                      setDeleteError(null)
                    }}
                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
              {editingTeam ? 'Team bearbeiten' : 'Team anlegen'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="teamName">Name *</Label>
              <Input id="teamName" {...register('name')} placeholder="z.B. Herren 1" />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="senior">Herren</SelectItem>
                      <SelectItem value="youth">Jugend</SelectItem>
                      <SelectItem value="ladies">Damen</SelectItem>
                      <SelectItem value="other">Sonstige</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="color">Teamfarbe</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="color"
                  type="color"
                  {...register('color')}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <span className="text-sm text-gray-500">
                  Wird in der App als Akzentfarbe verwendet
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: '#e94560' }}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingTeam ? (
                  'Speichern'
                ) : (
                  'Anlegen'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Team löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Team <strong>{deleteTarget?.name}</strong> wird unwiderruflich gelöscht.
          </p>
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

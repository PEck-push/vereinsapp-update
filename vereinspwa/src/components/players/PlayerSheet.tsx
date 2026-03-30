'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Player, Team } from '@/lib/types'

const playerSchema = z.object({
  firstName: z.string().min(2, 'Mindestens 2 Zeichen'),
  lastName: z.string().min(2, 'Mindestens 2 Zeichen'),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  jerseyNumber: z.coerce.number().min(1).max(99).optional().or(z.literal('')),
  position: z.enum(['Tormann', 'Abwehr', 'Mittelfeld', 'Sturm']).optional(),
  teamIds: z.array(z.string()),
  status: z.enum(['active', 'injured', 'inactive']),
  notificationPrefs: z.object({
    push: z.boolean(),
    email: z.boolean(),
  }),
})

export type PlayerFormValues = z.infer<typeof playerSchema>

interface PlayerSheetProps {
  open: boolean
  onClose: () => void
  player?: Player | null
  teams: Team[]
  onSubmit: (data: PlayerFormValues) => Promise<void>
}

export function PlayerSheet({ open, onClose, player, teams, onSubmit }: PlayerSheetProps) {
  const isEdit = !!player
  // FIX: Add error state so submit errors are visible to the user
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      jerseyNumber: '',
      position: undefined,
      teamIds: [],
      status: 'active',
      notificationPrefs: { push: true, email: true },
    },
  })

  useEffect(() => {
    if (player) {
      reset({
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        phone: player.phone ?? '',
        dateOfBirth: player.dateOfBirth
          ? new Date(player.dateOfBirth).toISOString().split('T')[0]
          : '',
        jerseyNumber: player.jerseyNumber ?? '',
        position: player.position,
        teamIds: player.teamIds,
        status: player.status,
        notificationPrefs: player.notificationPrefs,
      })
    } else {
      reset({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        jerseyNumber: '',
        position: undefined,
        teamIds: [],
        status: 'active',
        notificationPrefs: { push: true, email: true },
      })
    }
    // FIX: Clear error when sheet opens/closes or player changes
    setSubmitError(null)
  }, [player, reset, open])

  async function handleFormSubmit(data: PlayerFormValues) {
    // FIX: Wrap in try-catch so Firestore permission errors and other
    // failures are shown to the user instead of silently swallowed
    setSubmitError(null)
    try {
      await onSubmit(data)
      onClose()
    } catch (err) {
      console.error('[PlayerSheet] Submit error:', err)
      const message = err instanceof Error ? err.message : 'Spieler konnte nicht gespeichert werden.'
      // Check for common Firestore permission error
      if (message.includes('permission') || message.includes('PERMISSION_DENIED')) {
        setSubmitError('Keine Berechtigung. Stelle sicher, dass dein Admin-Account korrekt eingerichtet ist.')
      } else {
        setSubmitError(message)
      }
    }
  }

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: t.name,
    color: t.color,
  }))

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto px-5 sm:px-6">
        <SheetHeader className="mb-5">
          <SheetTitle style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>
            {isEdit ? 'Spieler bearbeiten' : 'Neuen Spieler anlegen'}
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {isEdit ? 'Änderungen werden sofort übernommen.' : 'Fülle die Felder aus und klicke auf Anlegen.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Name — stacked on mobile, side by side on wider */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Vorname *</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nachname *</Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail *</Label>
            <Input id="email" type="email" {...register('email')} disabled={isEdit} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            {isEdit && <p className="text-xs text-muted-foreground">E-Mail kann nach Erstellung nicht geändert werden.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" type="tel" {...register('phone')} placeholder="+43 664 ..." />
          </div>

          {/* Date + Jersey — stacked on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Geburtsdatum</Label>
              <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jerseyNumber">Rückennummer</Label>
              <Input id="jerseyNumber" type="number" min={1} max={99} {...register('jerseyNumber')} />
              {errors.jerseyNumber && <p className="text-xs text-red-500">1–99</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Position</Label>
            <Controller
              control={control}
              name="position"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Position wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tormann">Tormann</SelectItem>
                    <SelectItem value="Abwehr">Abwehr</SelectItem>
                    <SelectItem value="Mittelfeld">Mittelfeld</SelectItem>
                    <SelectItem value="Sturm">Sturm</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Teams</Label>
            <Controller
              control={control}
              name="teamIds"
              render={({ field }) => (
                <MultiSelect
                  options={teamOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Team(s) zuweisen"
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="injured">Verletzt</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* FIX: Show submit errors visibly */}
          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons — full width stacked on mobile */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button type="submit" variant="club" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern…</>
              ) : isEdit ? 'Speichern' : 'Anlegen'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
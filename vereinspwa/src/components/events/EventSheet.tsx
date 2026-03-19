'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Loader2 } from 'lucide-react'
import type { ClubEvent, Team } from '@/lib/types'

const eventSchema = z.object({
  title: z.string().min(2, 'Mindestens 2 Zeichen'),
  type: z.enum(['training', 'match', 'meeting', 'other']),
  startDate: z.string().min(1, 'Datum erforderlich'),
  startTime: z.string().min(1, 'Uhrzeit erforderlich'),
  endTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  teamIds: z.array(z.string()).min(1, 'Mindestens ein Team'),
})

type EventFormValues = z.infer<typeof eventSchema>

interface EventSheetProps {
  open: boolean
  onClose: () => void
  event?: ClubEvent | null
  teams: Team[]
  onSubmit: (data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>) => Promise<void>
}

function toLocalDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function toLocalTimeString(d: Date): string {
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
}

export function EventSheet({ open, onClose, event, teams, onSubmit }: EventSheetProps) {
  const isEdit = !!event

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      type: 'training',
      startDate: '',
      startTime: '18:00',
      endTime: '19:30',
      location: '',
      description: '',
      teamIds: [],
    },
  })

  useEffect(() => {
    if (event) {
      const start = event.startDate instanceof Date
        ? event.startDate
        : new Date(event.startDate as unknown as string)
      const end = event.endDate
        ? (event.endDate instanceof Date ? event.endDate : new Date(event.endDate as unknown as string))
        : undefined

      reset({
        title: event.title,
        type: event.type,
        startDate: toLocalDateString(start),
        startTime: toLocalTimeString(start),
        endTime: end ? toLocalTimeString(end) : '',
        location: event.location ?? '',
        description: event.description ?? '',
        teamIds: event.teamIds,
      })
    } else {
      // Default for new event: tomorrow at 18:00
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      reset({
        title: '',
        type: 'training',
        startDate: toLocalDateString(tomorrow),
        startTime: '18:00',
        endTime: '19:30',
        location: '',
        description: '',
        teamIds: [],
      })
    }
  }, [event, reset, open])

  async function handleFormSubmit(data: EventFormValues) {
    const startDate = new Date(`${data.startDate}T${data.startTime}:00`)
    const endDate = data.endTime
      ? new Date(`${data.startDate}T${data.endTime}:00`)
      : undefined

    await onSubmit({
      title: data.title,
      type: data.type,
      status: 'scheduled',
      startDate,
      endDate,
      location: data.location || undefined,
      description: data.description || undefined,
      teamIds: data.teamIds,
      createdBy: '', // Will be set by addEvent hook
    })
    onClose()
  }

  const teamOptions = teams.map(t => ({
    value: t.id,
    label: t.name,
    color: t.color,
  }))

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
            {isEdit ? 'Termin bearbeiten' : 'Neuen Termin anlegen'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titel *</Label>
            <Input id="title" {...register('title')} placeholder="z.B. Training U19" />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="match">Spiel</SelectItem>
                    <SelectItem value="meeting">Besprechung</SelectItem>
                    <SelectItem value="other">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Datum *</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
              {errors.startDate && <p className="text-xs text-red-500">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Von *</Label>
              <Input id="startTime" type="time" {...register('startTime')} />
              {errors.startTime && <p className="text-xs text-red-500">{errors.startTime.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="endTime">Bis</Label>
              <Input id="endTime" type="time" {...register('endTime')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Ort</Label>
              <Input id="location" {...register('location')} placeholder="z.B. Sportplatz" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Teams *</Label>
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
            {errors.teamIds && <p className="text-xs text-red-500">{errors.teamIds.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Beschreibung</Label>
            <textarea
              id="description"
              {...register('description')}
              placeholder="Optionale Details…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Abbrechen
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting}
              style={{ backgroundColor: '#e94560' }}
            >
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

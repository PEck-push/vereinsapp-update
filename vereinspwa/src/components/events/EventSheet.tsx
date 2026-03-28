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
import { Switch } from '@/components/ui/switch'
import { MultiSelect } from '@/components/ui/multi-select'
import { AlertCircle, Loader2, Repeat } from 'lucide-react'
import type { ClubEvent, RecurrenceFrequency, Team } from '@/lib/types'

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const eventSchema = z.object({
  title: z.string().min(2, 'Mindestens 2 Zeichen'),
  type: z.enum(['training', 'match', 'meeting', 'event', 'other']),
  startDate: z.string().min(1, 'Datum erforderlich'),
  startTime: z.string().min(1, 'Uhrzeit erforderlich'),
  endTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  /**
   * FIX: .min(0) statt .min(1) — leeres Array = Vereins-Event.
   * Validation passiert kontextabhängig in handleFormSubmit.
   */
  teamIds: z.array(z.string()),
  isClubEvent: z.boolean(),

  // ── Recurrence ──
  isRecurring: z.boolean(),
  recurrenceFrequency: z.enum(['weekly', 'biweekly']).optional(),
  recurrenceDays: z.array(z.number()).optional(),
  recurrenceUntil: z.string().optional(),
})

type EventFormValues = z.infer<typeof eventSchema>

const DAY_LABELS = [
  { value: 0, label: 'So' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
]

interface EventSheetProps {
  open: boolean
  onClose: () => void
  event?: ClubEvent | null
  teams: Team[]
  onSubmit: (
    data: Omit<ClubEvent, 'id' | 'clubId' | 'responseCount' | 'createdAt' | 'updatedAt'>,
    recurrence?: { frequency: RecurrenceFrequency; daysOfWeek: number[]; until: Date }
  ) => Promise<void>
}

function toLocalDateString(d: Date): string { return d.toISOString().split('T')[0] }
function toLocalTimeString(d: Date): string { return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) { if (value !== undefined) result[key] = value }
  return result as T
}

/** Calculate how many events a recurrence rule would generate */
function estimateRecurrenceCount(
  startDate: string,
  frequency: RecurrenceFrequency,
  daysOfWeek: number[],
  until: string
): number {
  if (!startDate || !until || daysOfWeek.length === 0) return 0
  const start = new Date(startDate)
  const end = new Date(until)
  if (end <= start) return 0

  const weekMs = 7 * 24 * 60 * 60 * 1000
  const interval = frequency === 'biweekly' ? 2 : 1
  const totalWeeks = Math.ceil((end.getTime() - start.getTime()) / weekMs)
  const activeWeeks = Math.ceil(totalWeeks / interval)

  return activeWeeks * daysOfWeek.length
}

export function EventSheet({ open, onClose, event, teams, onSubmit }: EventSheetProps) {
  const isEdit = !!event
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '', type: 'training', startDate: '', startTime: '18:00',
      endTime: '19:30', location: '', description: '', teamIds: [],
      isClubEvent: false, isRecurring: false, recurrenceFrequency: 'weekly',
      recurrenceDays: [], recurrenceUntil: '',
    },
  })

  const isClubEvent = watch('isClubEvent')
  const isRecurring = watch('isRecurring')
  const eventType = watch('type')
  const startDate = watch('startDate')
  const recurrenceFrequency = watch('recurrenceFrequency') as RecurrenceFrequency | undefined
  const recurrenceDays = watch('recurrenceDays') ?? []
  const recurrenceUntil = watch('recurrenceUntil') ?? ''

  // Auto-set isClubEvent when type is 'event'
  useEffect(() => {
    if (eventType === 'event' && !isClubEvent) {
      setValue('isClubEvent', true)
      setValue('teamIds', [])
    }
  }, [eventType, isClubEvent, setValue])

  // Auto-populate recurrence day from startDate
  useEffect(() => {
    if (startDate && isRecurring && recurrenceDays.length === 0) {
      const day = new Date(startDate).getDay()
      setValue('recurrenceDays', [day])
    }
  }, [startDate, isRecurring, recurrenceDays.length, setValue])

  // Auto-set recurrenceUntil to 3 months from start
  useEffect(() => {
    if (startDate && isRecurring && !recurrenceUntil) {
      const d = new Date(startDate)
      d.setMonth(d.getMonth() + 3)
      setValue('recurrenceUntil', toLocalDateString(d))
    }
  }, [startDate, isRecurring, recurrenceUntil, setValue])

  useEffect(() => {
    if (event) {
      const start = event.startDate instanceof Date ? event.startDate : new Date(event.startDate as unknown as string)
      const end = event.endDate ? (event.endDate instanceof Date ? event.endDate : new Date(event.endDate as unknown as string)) : undefined
      reset({
        title: event.title, type: event.type, startDate: toLocalDateString(start),
        startTime: toLocalTimeString(start), endTime: end ? toLocalTimeString(end) : '',
        location: event.location ?? '', description: event.description ?? '',
        teamIds: event.teamIds, isClubEvent: event.teamIds.length === 0,
        isRecurring: false, recurrenceFrequency: 'weekly', recurrenceDays: [], recurrenceUntil: '',
      })
    } else {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
      reset({
        title: '', type: 'training', startDate: toLocalDateString(tomorrow),
        startTime: '18:00', endTime: '19:30', location: '', description: '',
        teamIds: [], isClubEvent: false, isRecurring: false,
        recurrenceFrequency: 'weekly', recurrenceDays: [], recurrenceUntil: '',
      })
    }
    setSubmitError(null)
  }, [event, reset, open])

  const estimatedCount = isRecurring && recurrenceFrequency
    ? estimateRecurrenceCount(startDate, recurrenceFrequency, recurrenceDays, recurrenceUntil)
    : 0

  async function handleFormSubmit(data: EventFormValues) {
    setSubmitError(null)

    // Contextual validation: non-club-events need at least one team
    if (!data.isClubEvent && data.teamIds.length === 0) {
      setSubmitError('Bitte mindestens ein Team auswählen, oder als Vereins-Event markieren.')
      return
    }

    // Recurrence validation
    if (data.isRecurring) {
      if (!data.recurrenceFrequency) { setSubmitError('Wiederholungs-Frequenz fehlt.'); return }
      if (!data.recurrenceDays || data.recurrenceDays.length === 0) { setSubmitError('Wochentag(e) auswählen.'); return }
      if (!data.recurrenceUntil) { setSubmitError('Enddatum für die Serie fehlt.'); return }
      const untilDate = new Date(data.recurrenceUntil)
      const maxDate = new Date(data.startDate)
      maxDate.setMonth(maxDate.getMonth() + 6)
      if (untilDate > maxDate) { setSubmitError('Wiederholung max. 6 Monate im Voraus.'); return }
    }

    try {
      const startDate = new Date(`${data.startDate}T${data.startTime}:00`)
      const endDate = data.endTime ? new Date(`${data.startDate}T${data.endTime}:00`) : null

      const eventData = stripUndefined({
        title: data.title,
        type: data.type,
        status: 'scheduled' as const,
        startDate,
        ...(endDate && { endDate }),
        ...(data.location?.trim() && { location: data.location.trim() }),
        ...(data.description?.trim() && { description: data.description.trim() }),
        teamIds: data.isClubEvent ? [] : data.teamIds,
        createdBy: '',
      })

      const recurrence = data.isRecurring && data.recurrenceFrequency && data.recurrenceDays && data.recurrenceUntil
        ? {
            frequency: data.recurrenceFrequency,
            daysOfWeek: data.recurrenceDays,
            until: new Date(data.recurrenceUntil),
          }
        : undefined

      await onSubmit(eventData, recurrence)
      onClose()
    } catch (err) {
      console.error('[EventSheet] Submit error:', err)
      setSubmitError(err instanceof Error ? err.message : 'Termin konnte nicht gespeichert werden.')
    }
  }

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name, color: t.color }))

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto px-5 sm:px-6">
        <SheetHeader className="mb-6">
          <SheetTitle style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--club-primary, #1a1a2e)' }}>
            {isEdit ? 'Termin bearbeiten' : 'Neuen Termin anlegen'}
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {isEdit ? 'Änderungen werden sofort übernommen.' : 'Erstelle einen neuen Termin für deine Mannschaften.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Titel */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Titel *</Label>
            <Input id="title" {...register('title')} placeholder="z.B. Training U19" />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          {/* Typ */}
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Controller control={control} name="type" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="match">Spiel</SelectItem>
                  <SelectItem value="meeting">Besprechung</SelectItem>
                  <SelectItem value="event">Vereins-Event</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>

          {/* Datum + Zeiten */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="endTime">Bis</Label>
              <Input id="endTime" type="time" {...register('endTime')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Ort</Label>
              <Input id="location" {...register('location')} placeholder="z.B. Sportplatz" />
            </div>
          </div>

          {/* ── Vereins-Event Toggle ── */}
          {eventType !== 'event' && (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 border border-amber-200">
              <div>
                <p className="text-sm font-medium text-gray-800">Vereins-Event</p>
                <p className="text-xs text-gray-500">Betrifft alle Mannschaften</p>
              </div>
              <Controller control={control} name="isClubEvent" render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                    if (checked) setValue('teamIds', [])
                  }}
                />
              )} />
            </div>
          )}

          {/* Teams — nur wenn kein Vereins-Event */}
          {!isClubEvent && (
            <div className="space-y-1.5">
              <Label>Teams *</Label>
              <Controller control={control} name="teamIds" render={({ field }) => (
                <MultiSelect options={teamOptions} value={field.value} onChange={field.onChange} placeholder="Team(s) zuweisen" />
              )} />
            </div>
          )}

          {isClubEvent && (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
              Dieser Termin ist für den gesamten Verein sichtbar — unabhängig von Mannschaftszugehörigkeit.
            </p>
          )}

          {/* ── Wiederholung (nur bei Neuanlage, nicht bei Bearbeitung) ── */}
          {!isEdit && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Wiederkehrend</p>
                    <p className="text-xs text-gray-500">Serie von Terminen erstellen</p>
                  </div>
                </div>
                <Controller control={control} name="isRecurring" render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )} />
              </div>

              {isRecurring && (
                <div className="space-y-3 pl-1">
                  {/* Frequenz */}
                  <div className="space-y-1.5">
                    <Label>Frequenz</Label>
                    <Controller control={control} name="recurrenceFrequency" render={({ field }) => (
                      <Select value={field.value ?? 'weekly'} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Wöchentlich</SelectItem>
                          <SelectItem value="biweekly">Alle 2 Wochen</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>

                  {/* Wochentage */}
                  <div className="space-y-1.5">
                    <Label>Wochentag(e)</Label>
                    <Controller control={control} name="recurrenceDays" render={({ field }) => (
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map(({ value, label }) => {
                          const selected = (field.value ?? []).includes(value)
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                const current = field.value ?? []
                                field.onChange(
                                  selected
                                    ? current.filter((d: number) => d !== value)
                                    : [...current, value].sort()
                                )
                              }}
                              className={`w-9 h-9 rounded-full text-xs font-semibold border-2 transition-colors ${
                                selected
                                  ? 'border-transparent text-white'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                              style={selected ? { backgroundColor: 'var(--club-secondary, #e94560)' } : {}}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )} />
                  </div>

                  {/* Ende der Serie */}
                  <div className="space-y-1.5">
                    <Label htmlFor="recurrenceUntil">Serie bis (inkl.)</Label>
                    <Input id="recurrenceUntil" type="date" {...register('recurrenceUntil')} />
                  </div>

                  {/* Vorschau */}
                  {estimatedCount > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-800 px-3 py-2 rounded-md">
                      <Repeat className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>{estimatedCount} Termine</strong> werden erstellt
                        {recurrenceFrequency === 'biweekly' ? ' (alle 2 Wochen)' : ' (wöchentlich)'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Beschreibung */}
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

          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button type="submit" variant="club" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Speichern…</>
              ) : isRecurring && estimatedCount > 0 ? (
                `${estimatedCount} Termine anlegen`
              ) : isEdit ? 'Speichern' : 'Anlegen'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
'use client'

import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { saveMatchStat } from '@/lib/hooks/useMatchStats'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { ClubEvent, Player } from '@/lib/types'

const matchSchema = z.object({
  opponent: z.string().min(1, 'Gegner erforderlich'),
  homeOrAway: z.enum(['home', 'away']),
  goalsFor: z.coerce.number().min(0).max(20),
  goalsAgainst: z.coerce.number().min(0).max(20),
  playerRows: z.array(z.object({
    playerId: z.string(),
    include: z.boolean(),
    isStarter: z.boolean(),
    minuteIn: z.coerce.number().min(0).max(89),
    minuteOut: z.coerce.number().min(1).max(90),
    goals: z.coerce.number().min(0).max(20),
    assists: z.coerce.number().min(0).max(20),
    yellowCards: z.coerce.number().min(0).max(2),
    redCard: z.boolean(),
  }).refine(r => !r.include || r.minuteIn < r.minuteOut, {
    message: 'Min von muss kleiner als Min bis sein',
    path: ['minuteIn'],
  })),
})

type MatchForm = z.infer<typeof matchSchema>

interface MatchReportSheetProps {
  open: boolean
  onClose: () => void
  event: ClubEvent
  players: Player[]
  onSaved: () => void
}

export function MatchReportSheet({ open, onClose, event, players, onSaved }: MatchReportSheetProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<MatchForm>({
    resolver: zodResolver(matchSchema),
    defaultValues: {
      opponent: '',
      homeOrAway: 'home',
      goalsFor: 0,
      goalsAgainst: 0,
      playerRows: players.map(p => ({
        playerId: p.id,
        include: false,
        isStarter: false,
        minuteIn: 0,
        minuteOut: 90,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCard: false,
      })),
    },
  })

  const { fields } = useFieldArray({ control, name: 'playerRows' })
  const homeOrAway = watch('homeOrAway')

  async function onSubmit(data: MatchForm) {
    setServerError(null)
    try {
      const teamId = event.teamIds[0] // primary team
      await saveMatchStat({
        eventId: event.id,
        teamId,
        opponent: data.opponent,
        homeOrAway: data.homeOrAway,
        result: { goalsFor: data.goalsFor, goalsAgainst: data.goalsAgainst },
        playerMinutes: data.playerRows
          .filter(r => r.include)
          .map(r => ({
            playerId: r.playerId,
            minuteIn: r.isStarter ? 0 : r.minuteIn,
            minuteOut: r.minuteOut,
            isStarter: r.isStarter,
            goals: r.goals,
            assists: r.assists,
            yellowCards: r.yellowCards,
            redCard: r.redCard,
          })),
      })
      onSaved()
      onClose()
    } catch {
      setServerError('Spielbericht konnte nicht gespeichert werden.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
            Spielbericht eintragen
          </SheetTitle>
          <p className="text-sm text-gray-500">{event.title}</p>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Sektion 1: Spieldaten */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Spieldaten</h3>

            <div className="space-y-1.5">
              <Label htmlFor="opponent">Gegner *</Label>
              <Input id="opponent" {...register('opponent')} placeholder="z.B. SC Rapid" />
              {errors.opponent && <p className="text-xs text-red-500">{errors.opponent.message}</p>}
            </div>

            {/* Heim/Auswärts Toggle */}
            <div className="space-y-1.5">
              <Label>Heim / Auswärts</Label>
              <div className="flex rounded-lg border overflow-hidden w-fit">
                {(['home', 'away'] as const).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setValue('homeOrAway', val)}
                    className={`px-5 py-2 text-sm font-medium transition-colors ${
                      homeOrAway === val
                        ? 'text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    style={homeOrAway === val ? { backgroundColor: '#1a1a2e' } : {}}
                  >
                    {val === 'home' ? 'Heim' : 'Auswärts'}
                  </button>
                ))}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label>Tore für uns</Label>
                <Input type="number" min={0} max={20} className="w-20" {...register('goalsFor')} />
              </div>
              <span className="text-xl text-gray-400 mt-5">:</span>
              <div className="space-y-1.5">
                <Label>Tore Gegner</Label>
                <Input type="number" min={0} max={20} className="w-20" {...register('goalsAgainst')} />
              </div>
            </div>
          </div>

          {/* Sektion 2: Spieler-Einsätze */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Spieler-Einsätze</h3>
            <p className="text-xs text-gray-400">Hake Spieler ab, die am Spiel teilgenommen haben.</p>

            {/* Desktop: Table Grid (hidden on mobile) */}
            <div className="hidden md:block space-y-1">
              <div className="grid text-xs text-gray-400 font-medium px-2 py-1" style={{
                gridTemplateColumns: '24px 1fr 80px 60px 60px 44px 44px 36px 36px',
                gap: '6px'
              }}>
                <span></span>
                <span>Spieler</span>
                <span className="text-center">Startelf</span>
                <span className="text-center">Min von</span>
                <span className="text-center">Min bis</span>
                <span className="text-center">⚽</span>
                <span className="text-center">🅰</span>
                <span className="text-center">🟨</span>
                <span className="text-center">🟥</span>
              </div>

              {fields.map((field, idx) => {
                const player = players.find(p => p.id === field.playerId)
                if (!player) return null

                const isIncluded = watch(`playerRows.${idx}.include`)
                const isStarter = watch(`playerRows.${idx}.isStarter`)

                return (
                  <div
                    key={field.id}
                    className={`grid items-center px-2 py-1.5 rounded-lg transition-colors ${isIncluded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    style={{ gridTemplateColumns: '24px 1fr 80px 60px 60px 44px 44px 36px 36px', gap: '6px' }}
                  >
                    <Controller control={control} name={`playerRows.${idx}.include`} render={({ field: f }) => (
                      <input type="checkbox" checked={f.value} onChange={f.onChange} className="w-4 h-4 rounded accent-[#e94560]" />
                    )} />
                    <span className={`text-sm truncate ${isIncluded ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{player.firstName} {player.lastName}</span>
                    <div className="flex justify-center">
                      <Controller control={control} name={`playerRows.${idx}.isStarter`} render={({ field: f }) => (
                        <input type="checkbox" checked={f.value} onChange={(e) => { f.onChange(e); if (e.target.checked) setValue(`playerRows.${idx}.minuteIn`, 0) }} disabled={!isIncluded} className="w-4 h-4 rounded accent-[#1a1a2e]" />
                      )} />
                    </div>
                    <Input type="number" min={0} max={89} className="h-7 text-xs text-center px-1" disabled={!isIncluded || isStarter} {...register(`playerRows.${idx}.minuteIn`)} />
                    <Input type="number" min={1} max={90} className="h-7 text-xs text-center px-1" disabled={!isIncluded} {...register(`playerRows.${idx}.minuteOut`)} />
                    <Input type="number" min={0} max={20} className="h-7 text-xs text-center px-1" disabled={!isIncluded} {...register(`playerRows.${idx}.goals`)} />
                    <Input type="number" min={0} max={20} className="h-7 text-xs text-center px-1" disabled={!isIncluded} {...register(`playerRows.${idx}.assists`)} />
                    <Input type="number" min={0} max={2} className="h-7 text-xs text-center px-1" disabled={!isIncluded} {...register(`playerRows.${idx}.yellowCards`)} />
                    <div className="flex justify-center">
                      <Controller control={control} name={`playerRows.${idx}.redCard`} render={({ field: f }) => (
                        <input type="checkbox" checked={f.value} onChange={f.onChange} disabled={!isIncluded} className="w-4 h-4 rounded accent-red-600" />
                      )} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Mobile: Card-based layout (visible only on small screens) */}
            <div className="md:hidden space-y-2">
              {fields.map((field, idx) => {
                const player = players.find(p => p.id === field.playerId)
                if (!player) return null

                const isIncluded = watch(`playerRows.${idx}.include`)
                const isStarter = watch(`playerRows.${idx}.isStarter`)

                return (
                  <div key={field.id} className={`rounded-lg border p-3 transition-colors ${isIncluded ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
                    {/* Player header with include checkbox */}
                    <div className="flex items-center gap-2 mb-2">
                      <Controller control={control} name={`playerRows.${idx}.include`} render={({ field: f }) => (
                        <input type="checkbox" checked={f.value} onChange={f.onChange} className="w-4 h-4 rounded accent-[#e94560]" />
                      )} />
                      <span className={`text-sm flex-1 ${isIncluded ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                        {player.firstName} {player.lastName}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Controller control={control} name={`playerRows.${idx}.isStarter`} render={({ field: f }) => (
                          <input type="checkbox" checked={f.value} onChange={(e) => { f.onChange(e); if (e.target.checked) setValue(`playerRows.${idx}.minuteIn`, 0) }} disabled={!isIncluded} className="w-3.5 h-3.5 rounded accent-[#1a1a2e]" />
                        )} />
                        Startelf
                      </label>
                    </div>

                    {/* Stats grid (only shown when included) */}
                    {isIncluded && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <label className="text-[10px] text-gray-400 block">Min von</label>
                          <Input type="number" min={0} max={89} className="h-7 text-xs text-center" disabled={isStarter} {...register(`playerRows.${idx}.minuteIn`)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block">Min bis</label>
                          <Input type="number" min={1} max={90} className="h-7 text-xs text-center" {...register(`playerRows.${idx}.minuteOut`)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block">⚽ Tore</label>
                          <Input type="number" min={0} max={20} className="h-7 text-xs text-center" {...register(`playerRows.${idx}.goals`)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block">🅰 Assists</label>
                          <Input type="number" min={0} max={20} className="h-7 text-xs text-center" {...register(`playerRows.${idx}.assists`)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block">🟨 Gelb</label>
                          <Input type="number" min={0} max={2} className="h-7 text-xs text-center" {...register(`playerRows.${idx}.yellowCards`)} />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 pb-1.5">
                            <Controller control={control} name={`playerRows.${idx}.redCard`} render={({ field: f }) => (
                              <input type="checkbox" checked={f.value} onChange={f.onChange} className="w-3.5 h-3.5 rounded accent-red-600" />
                            )} />
                            🟥 Rot
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{serverError}</p>
          )}

          <div className="flex gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1" style={{ backgroundColor: '#e94560' }}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Spielbericht speichern
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

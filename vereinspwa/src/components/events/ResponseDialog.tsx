'use client'

import { useState } from 'react'
import { submitResponse } from '@/lib/hooks/useEvents'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Check, Loader2, X } from 'lucide-react'
import type { ClubEvent } from '@/lib/types'
import { Timestamp } from 'firebase/firestore'

type Step = 'choice' | 'decline_reason' | 'submitting' | 'done'
type DeclineCategory = 'injury' | 'work' | 'private' | 'other'

const DECLINE_CATEGORIES: { value: DeclineCategory; label: string; emoji: string }[] = [
  { value: 'injury', label: 'Verletzung / Krankheit', emoji: '🤕' },
  { value: 'work', label: 'Arbeit / Schule', emoji: '💼' },
  { value: 'private', label: 'Privates', emoji: '🏠' },
  { value: 'other', label: 'Sonstiges', emoji: '📌' },
]

type ResponseDialogProps = {
  open: boolean
  event: ClubEvent | null
  playerId: string
  onClose: () => void
  onSubmit: (
    eventId: string,
    playerId: string,
    response: { playerId: string; status: 'accepted' | 'declined'; declineCategory?: DeclineCategory; reason?: string }
  ) => Promise<void>
}

function formatEventDate(date: unknown): string {
  const d = date instanceof Timestamp ? date.toDate() : date instanceof Date ? date : new Date(date as string)
  return d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatEventTime(date: unknown): string {
  const d = date instanceof Timestamp ? date.toDate() : date instanceof Date ? date : new Date(date as string)
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
}

export function ResponseDialog({ open, event, playerId, onClose, onSubmit }: ResponseDialogProps) {
  const [step, setStep] = useState<Step>('choice')
  const [selectedCategory, setSelectedCategory] = useState<DeclineCategory | null>(null)
  const [reason, setReason] = useState('')

  function reset() {
    setStep('choice')
    setSelectedCategory(null)
    setReason('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleAccept() {
    if (!event) return
    setStep('submitting')
    await onSubmit(event.id, playerId, { playerId, status: 'accepted' })
    setStep('done')
    setTimeout(handleClose, 1200)
  }

  async function handleDeclineSubmit() {
    if (!event || !selectedCategory) return
    setStep('submitting')
    await onSubmit(event.id, playerId, {
      playerId,
      status: 'declined',
      declineCategory: selectedCategory,
      reason: reason.trim() || undefined,
    })
    setStep('done')
    setTimeout(handleClose, 1200)
  }

  if (!event) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
            {event.title}
          </DialogTitle>
          <div className="text-sm text-gray-500 space-y-0.5 mt-1">
            <p>{formatEventDate(event.startDate)}</p>
            <p>{formatEventTime(event.startDate)} Uhr{event.location && ` · ${event.location}`}</p>
          </div>
        </DialogHeader>

        {step === 'choice' && (
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleAccept}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-colors"
            >
              <span className="text-2xl">✓</span>
              <span className="text-sm font-semibold text-green-800">Ich bin dabei</span>
            </button>
            <button
              onClick={() => setStep('decline_reason')}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-colors"
            >
              <span className="text-2xl">✗</span>
              <span className="text-sm font-semibold text-red-800">Ich kann nicht</span>
            </button>
          </div>
        )}

        {step === 'decline_reason' && (
          <div className="space-y-4 mt-2">
            <p className="text-sm font-medium text-gray-700">Was ist der Grund?</p>
            <div className="grid grid-cols-2 gap-2">
              {DECLINE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    selectedCategory === cat.value
                      ? 'border-[#e94560] bg-red-50 text-[#e94560]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-center leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Freitext (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 200))}
                placeholder="Freitext..."
                rows={2}
                className="w-full rounded-md border border-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-gray-400 text-right">{reason.length}/200</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('choice')}>Zurück</Button>
              <Button
                className="flex-1"
                disabled={!selectedCategory}
                onClick={handleDeclineSubmit}
                style={{ backgroundColor: '#e94560' }}
              >
                Bestätigen
              </Button>
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Check className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium text-gray-700">Deine Antwort wurde gespeichert</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
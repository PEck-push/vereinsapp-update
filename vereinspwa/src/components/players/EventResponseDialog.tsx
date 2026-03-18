'use client'

import { useState } from 'react'
import { submitResponse } from '@/lib/hooks/useEvents'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Loader2, MapPin, X } from 'lucide-react'
import type { ClubEvent } from '@/lib/types'
import { Timestamp } from 'firebase/firestore'

type Step = 'choice' | 'decline-reason' | 'confirmed'
type DeclineCategory = 'injury' | 'work' | 'private' | 'other'

const DECLINE_CATEGORIES: { value: DeclineCategory; label: string; emoji: string }[] = [
  { value: 'injury', label: 'Verletzung / Krankheit', emoji: '🤕' },
  { value: 'work', label: 'Arbeit / Schule', emoji: '💼' },
  { value: 'private', label: 'Privates', emoji: '🏠' },
  { value: 'other', label: 'Sonstiges', emoji: '📝' },
]

function formatEventDate(date: Date | Timestamp | unknown): string {
  const d = date instanceof Timestamp ? date.toDate() : date instanceof Date ? date : new Date(date as string)
  return d.toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatEventTime(date: Date | Timestamp | unknown): string {
  const d = date instanceof Timestamp ? date.toDate() : date instanceof Date ? date : new Date(date as string)
  return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
}

interface EventResponseDialogProps {
  open: boolean
  onClose: () => void
  event: ClubEvent
  playerId: string
  existingResponse?: 'accepted' | 'declined' | null
}

export function EventResponseDialog({
  open,
  onClose,
  event,
  playerId,
  existingResponse,
}: EventResponseDialogProps) {
  const [step, setStep] = useState<Step>('choice')
  const [declineCategory, setDeclineCategory] = useState<DeclineCategory | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    // Reset state on close
    setStep('choice')
    setDeclineCategory(null)
    setReason('')
    setError(null)
    onClose()
  }

  async function handleAccept() {
    setSubmitting(true)
    setError(null)
    try {
      await submitResponse(event.id, playerId, { playerId, status: 'accepted' })
      setStep('confirmed')
      setTimeout(handleClose, 1800)
    } catch {
      setError('Deine Antwort konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeclineConfirm() {
    if (!declineCategory) return
    setSubmitting(true)
    setError(null)
    try {
      await submitResponse(event.id, playerId, {
        playerId,
        status: 'declined',
        declineCategory,
        reason: reason.trim() || undefined,
      })
      setStep('confirmed')
      setTimeout(handleClose, 1800)
    } catch {
      setError('Deine Antwort konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        {/* Event Info Header – shown on all steps */}
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}>
            {event.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 text-sm text-gray-500 -mt-2 mb-2">
          <span>{formatEventDate(event.startDate)} · {formatEventTime(event.startDate)}</span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {event.location}
            </span>
          )}
          {existingResponse && (
            <Badge
              variant={existingResponse === 'accepted' ? 'success' : 'muted'}
              className="self-start mt-1"
            >
              Bisher: {existingResponse === 'accepted' ? 'Zugesagt' : 'Abgesagt'}
            </Badge>
          )}
        </div>

        {/* Step 1: Accept / Decline choice */}
        {step === 'choice' && (
          <div className="flex gap-3">
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-800 font-semibold transition-colors disabled:opacity-50"
              style={{ borderRadius: '8px' }}
            >
              {submitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Check className="w-6 h-6" />
              )}
              <span className="text-sm">Ich bin dabei</span>
            </button>

            <button
              onClick={() => setStep('decline-reason')}
              disabled={submitting}
              className="flex-1 flex flex-col items-center gap-2 py-5 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold transition-colors disabled:opacity-50"
              style={{ borderRadius: '8px' }}
            >
              <X className="w-6 h-6" />
              <span className="text-sm">Ich kann nicht</span>
            </button>
          </div>
        )}

        {/* Step 2: Decline reason */}
        {step === 'decline-reason' && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">Was ist der Grund?</p>

            <div className="grid grid-cols-2 gap-2">
              {DECLINE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setDeclineCategory(cat.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    declineCategory === cat.value
                      ? 'border-[#e94560] bg-red-50 text-[#e94560]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                  style={{ borderRadius: '8px' }}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-center leading-tight text-xs">{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">
                Möchtest du noch etwas hinzufügen? (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 200))}
                placeholder="z.B. Bin beim Arzt..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-gray-400 text-right">{reason.length}/200</p>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('choice')} className="flex-1">
                Zurück
              </Button>
              <Button
                size="sm"
                onClick={handleDeclineConfirm}
                disabled={!declineCategory || submitting}
                className="flex-1"
                style={{ backgroundColor: '#e94560' }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bestätigen'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 'confirmed' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-800">
              Deine Antwort wurde gespeichert.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

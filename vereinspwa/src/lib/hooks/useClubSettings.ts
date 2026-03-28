'use client'

import { useState } from 'react'
import { useClubTheme } from '@/components/layout/ClubThemeProvider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Check, Database, Loader2, Trash2, X } from 'lucide-react'

/**
 * Shows when _seedMode is true on the club document.
 * - Yellow banner with "Testmodus aktiv"
 * - Delete button to remove all _seed:true data
 */
export function SeedModeBanner() {
  const { seedMode } = useClubTheme()
  const [dismissed, setDismissed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  if (!seedMode || dismissed) return null

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/seed', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.message)
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      setResult(`Fehler: ${(err as Error).message}`)
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">Testmodus aktiv</p>
          <p className="text-xs text-amber-600">Testdaten werden angezeigt (markiert mit _seed).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}
          className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 text-xs">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />Testdaten löschen
        </Button>
        <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 shrink-0 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !o && !deleting && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Testmodus beenden?</DialogTitle></DialogHeader>
          {result ? (
            <div className="py-4">
              <p className="text-sm text-green-700 bg-green-50 p-3 rounded-md flex items-center gap-2">
                <Check className="w-4 h-4" />{result}
              </p>
              <p className="text-xs text-gray-400 mt-2">Seite wird neu geladen...</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm text-gray-600">
                <p>Folgendes wird gelöscht:</p>
                <p className="text-xs text-gray-500">
                  Alle Test-Spieler, Teams, Events, Responses und Spielberichte
                  (nur Dokumente mit <code className="bg-gray-100 px-1 rounded">_seed: true</code>).
                </p>
                <p className="text-sm font-medium text-gray-800">
                  Echte Daten bleiben erhalten.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>Abbrechen</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Lösche...</> : <><Trash2 className="w-4 h-4 mr-2" />Löschen</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Settings section for loading test data.
 * Shows only when NO seed data is active.
 * Place this in the Settings page.
 */
export function SeedSettingsSection() {
  const { seedMode } = useClubTheme()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ message: string; stats?: Record<string, number> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (seedMode) return null // Already in test mode

  async function handleSeed() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult({ message: data.message, stats: data.stats })
      setTimeout(() => window.location.reload(), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Testmodus
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Testdaten laden um die App auszuprobieren
        </p>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4" style={{ borderRadius: '8px' }}>
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-700">
              Erstellt einen kompletten Test-Datensatz mit <b>4 Mannschaften</b>,{' '}
              <b>48 Spielern</b>, <b>Trainings und Spielen</b> der letzten 6 Wochen
              inklusive Zu-/Absagen und Spielberichten.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Alle Testdaten werden mit einem <code className="bg-gray-100 px-1 rounded">_seed</code> Flag
              markiert und können jederzeit wieder gelöscht werden, ohne echte Daten zu beeinflussen.
            </p>
          </div>
        </div>

        {result ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800 flex items-center gap-2">
              <Check className="w-4 h-4" />{result.message}
            </p>
            {result.stats && (
              <p className="text-xs text-green-600 mt-1">
                {result.stats.teams} Teams, {result.stats.players} Spieler,{' '}
                {result.stats.events} Events, {result.stats.responses} Antworten
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">Seite wird neu geladen...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : (
          <Button onClick={handleSeed} disabled={loading} variant="outline">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Erstelle Testdaten...</>
            ) : (
              <><Database className="w-4 h-4 mr-2" />Testdaten laden</>
            )}
          </Button>
        )}
      </div>
    </section>
  )
}
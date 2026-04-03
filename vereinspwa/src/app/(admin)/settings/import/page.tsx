'use client'

import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { useTeams } from '@/lib/hooks/useTeams'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toaster'
import {
  AlertCircle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet,
  Loader2, Upload,
} from 'lucide-react'
import Link from 'next/link'

type FieldMapping = 'ignore' | 'firstName' | 'lastName' | 'email' | 'phone' | 'jerseyNumber' | 'team' | 'position'

const FIELD_OPTIONS: { value: FieldMapping; label: string }[] = [
  { value: 'ignore', label: '— Ignorieren —' },
  { value: 'firstName', label: 'Vorname' },
  { value: 'lastName', label: 'Nachname' },
  { value: 'email', label: 'E-Mail' },
  { value: 'phone', label: 'Telefon' },
  { value: 'jerseyNumber', label: 'Rückennummer' },
  { value: 'team', label: 'Team' },
  { value: 'position', label: 'Position' },
]

const POSITION_MAP: Record<string, string> = {
  tw: 'Tormann', tormann: 'Tormann', goalkeeper: 'Tormann', gk: 'Tormann',
  abwehr: 'Abwehr', verteidiger: 'Abwehr', defender: 'Abwehr', def: 'Abwehr', iv: 'Abwehr',
  mittelfeld: 'Mittelfeld', midfielder: 'Mittelfeld', mid: 'Mittelfeld', mf: 'Mittelfeld',
  sturm: 'Sturm', stürmer: 'Sturm', angriff: 'Sturm', forward: 'Sturm', st: 'Sturm',
}

interface ImportRow {
  raw: Record<string, string>
  mapped: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    jerseyNumber?: number
    team?: string
    position?: string
  }
  errors: string[]
}

type ImportStage = 'upload' | 'mapping' | 'preview' | 'importing' | 'result'

interface ImportResult {
  imported: number
  errors: Array<{ index: number; reason: string }>
}

export default function ImportPage() {
  const { teams } = useTeams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<ImportStage>('upload')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [mappings, setMappings] = useState<Record<string, FieldMapping>>({})
  const [defaultTeamId, setDefaultTeamId] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState(0)

  // ── Step 1: File Upload ──
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        const data = results.data as Record<string, string>[]
        if (data.length === 0) {
          toast.error('CSV ist leer', 'Keine Daten gefunden.')
          return
        }

        const headers = Object.keys(data[0])
        setCsvHeaders(headers)
        setCsvData(data)

        // Auto-detect column mappings
        const autoMappings: Record<string, FieldMapping> = {}
        for (const h of headers) {
          const lower = h.toLowerCase().trim()
          if (lower.includes('vorname') || lower === 'firstname' || lower === 'first_name') {
            autoMappings[h] = 'firstName'
          } else if (lower.includes('nachname') || lower === 'lastname' || lower === 'last_name' || lower === 'name') {
            autoMappings[h] = 'lastName'
          } else if (lower.includes('mail') || lower.includes('e-mail')) {
            autoMappings[h] = 'email'
          } else if (lower.includes('telefon') || lower.includes('phone') || lower.includes('handy') || lower.includes('mobil')) {
            autoMappings[h] = 'phone'
          } else if (lower.includes('nummer') || lower.includes('number') || lower.includes('trikot') || lower.includes('jersey')) {
            autoMappings[h] = 'jerseyNumber'
          } else if (lower.includes('team') || lower.includes('mannschaft')) {
            autoMappings[h] = 'team'
          } else if (lower.includes('position')) {
            autoMappings[h] = 'position'
          } else {
            autoMappings[h] = 'ignore'
          }
        }
        setMappings(autoMappings)
        setStage('mapping')
      },
      error(err) {
        toast.error('CSV-Fehler', err.message)
      },
    })
  }

  // ── Step 2: Apply Mappings → Preview ──
  const importRows: ImportRow[] = useMemo(() => {
    if (stage !== 'preview' && stage !== 'importing' && stage !== 'result') return []

    return csvData.map((row) => {
      const mapped: ImportRow['mapped'] = {}
      const errors: string[] = []

      for (const [header, field] of Object.entries(mappings)) {
        if (field === 'ignore') continue
        const val = row[header]?.trim()
        if (!val) continue

        if (field === 'jerseyNumber') {
          const num = parseInt(val, 10)
          if (!isNaN(num)) mapped.jerseyNumber = num
        } else if (field === 'position') {
          mapped.position = POSITION_MAP[val.toLowerCase()] ?? val
        } else {
          mapped[field] = val
        }
      }

      if (!mapped.firstName) errors.push('Vorname fehlt')
      if (!mapped.lastName) errors.push('Nachname fehlt')
      if (!mapped.email) errors.push('E-Mail fehlt')
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push('E-Mail ungültig')

      return { raw: row, mapped, errors }
    })
  }, [csvData, mappings, stage])

  const validCount = importRows.filter(r => r.errors.length === 0).length
  const errorCount = importRows.filter(r => r.errors.length > 0).length

  function goToPreview() {
    // Validate that at least firstName, lastName, email are mapped
    const mapped = new Set(Object.values(mappings))
    if (!mapped.has('firstName') || !mapped.has('lastName') || !mapped.has('email')) {
      toast.error('Pflichtfelder nicht zugeordnet', 'Vorname, Nachname und E-Mail müssen zugeordnet sein.')
      return
    }
    setStage('preview')
  }

  // ── Step 3: Import ──
  async function startImport() {
    const validRows = importRows.filter(r => r.errors.length === 0)
    if (validRows.length === 0) return

    setImporting(true)
    setStage('importing')
    setProgress(0)

    const allErrors: Array<{ index: number; reason: string }> = []
    let totalImported = 0
    const batchSize = 50

    for (let i = 0; i < validRows.length; i += batchSize) {
      const chunk = validRows.slice(i, i + batchSize)
      const players = chunk.map(r => {
        const teamIds: string[] = []
        if (defaultTeamId) teamIds.push(defaultTeamId)
        // If team name is provided, try to match
        if (r.mapped.team) {
          const matchedTeam = teams.find(t =>
            t.name.toLowerCase() === r.mapped.team!.toLowerCase()
          )
          if (matchedTeam && !teamIds.includes(matchedTeam.id)) {
            teamIds.push(matchedTeam.id)
          }
        }

        return {
          firstName: r.mapped.firstName!,
          lastName: r.mapped.lastName!,
          email: r.mapped.email!,
          phone: r.mapped.phone,
          jerseyNumber: r.mapped.jerseyNumber,
          position: r.mapped.position,
          teamIds,
        }
      })

      try {
        const res = await fetch('/api/players/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players }),
        })
        const data = await res.json()
        if (res.ok) {
          totalImported += data.imported
          allErrors.push(...(data.errors ?? []).map((e: { index: number; reason: string }) => ({
            ...e,
            index: e.index + i,
          })))
        } else {
          toast.error('Import-Fehler', data.error)
        }
      } catch {
        toast.error('Netzwerkfehler', 'Server nicht erreichbar.')
      }

      setProgress(Math.min(100, Math.round(((i + chunk.length) / validRows.length) * 100)))
    }

    setResult({ imported: totalImported, errors: allErrors })
    setImporting(false)
    setStage('result')
  }

  // ── Template Download ──
  function downloadTemplate() {
    const csv = 'Vorname,Nachname,E-Mail,Telefon,Rückennummer,Mannschaft,Position\nMax,Mustermann,max@example.com,0664 1234567,10,Kampfmannschaft,Mittelfeld\n'
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'spieler-import-vorlage.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Spieler importieren
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">CSV-Datei hochladen und Spieler anlegen</p>
        </div>
      </div>

      {/* Stage: Upload */}
      {stage === 'upload' && (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-600 font-medium">CSV-Datei hierher ziehen oder klicken</p>
            <p className="text-xs text-gray-400 mt-1">Unterstützt: .csv (UTF-8, komma- oder semikolongetrennt)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Vorlage herunterladen
          </Button>
        </div>
      )}

      {/* Stage: Column Mapping */}
      {stage === 'mapping' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>{csvData.length}</strong> Zeilen gefunden. Ordne die Spalten den Feldern zu.
            </p>
          </div>

          <div className="bg-white border rounded-lg divide-y">
            {csvHeaders.map(header => (
              <div key={header} className="flex items-center gap-4 p-3">
                <span className="text-sm font-mono text-gray-600 flex-1 truncate">{header}</span>
                <span className="text-xs text-gray-400 truncate max-w-[120px]">
                  z.B. "{csvData[0]?.[header]}"
                </span>
                <Select
                  value={mappings[header] ?? 'ignore'}
                  onValueChange={v => setMappings(prev => ({ ...prev, [header]: v as FieldMapping }))}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Default team */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Standard-Team:</span>
            <Select value={defaultTeamId} onValueChange={setDefaultTeamId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Kein Standard-Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Kein Standard-Team</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('upload')}>Zurück</Button>
            <Button variant="club" onClick={goToPreview}>
              Vorschau anzeigen
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Preview */}
      {stage === 'preview' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex-1">
              <p className="text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                <strong>{validCount}</strong> Spieler bereit
              </p>
            </div>
            {errorCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex-1">
                <p className="text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  <strong>{errorCount}</strong> Fehler
                </p>
              </div>
            )}
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Vorname</TableHead>
                  <TableHead>Nachname</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.slice(0, 100).map((row, i) => (
                  <TableRow key={i} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                    <TableCell className="text-xs text-gray-400">{i + 1}</TableCell>
                    <TableCell className="text-sm">{row.mapped.firstName ?? '—'}</TableCell>
                    <TableCell className="text-sm">{row.mapped.lastName ?? '—'}</TableCell>
                    <TableCell className="text-sm">{row.mapped.email ?? '—'}</TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">{row.mapped.phone ?? '—'}</TableCell>
                    <TableCell>
                      {row.errors.length > 0 ? (
                        <Badge variant="destructive" className="text-[10px]" title={row.errors.join(', ')}>
                          Fehler
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {importRows.length > 100 && (
              <p className="text-xs text-gray-400 p-3 text-center">
                … und {importRows.length - 100} weitere Zeilen
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('mapping')}>Zurück</Button>
            <Button variant="club" onClick={startImport} disabled={validCount === 0}>
              <Upload className="w-4 h-4 mr-2" />
              {validCount} Spieler importieren
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Importing */}
      {stage === 'importing' && (
        <div className="text-center py-16 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          <p className="text-sm text-gray-600">Importiere Spieler…</p>
          <div className="w-64 mx-auto bg-gray-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, backgroundColor: 'var(--club-primary, #1a1a2e)' }}
            />
          </div>
          <p className="text-xs text-gray-400">{progress}%</p>
        </div>
      )}

      {/* Stage: Result */}
      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800 font-medium">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              {result.imported} Spieler erfolgreich angelegt
              {result.errors.length > 0 && (
                <>, <span className="text-red-600">{result.errors.length} Fehler</span></>
              )}
            </p>
          </div>

          {result.errors.length > 0 && (
            <div className="bg-white border rounded-lg p-4 space-y-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Fehler:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">
                  Zeile {e.index + 1}: {e.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Link href="/players">
              <Button variant="club">Zur Spielerliste</Button>
            </Link>
            <Button variant="outline" onClick={() => {
              setStage('upload')
              setCsvData([])
              setCsvHeaders([])
              setMappings({})
              setResult(null)
            }}>
              Weiteren Import starten
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

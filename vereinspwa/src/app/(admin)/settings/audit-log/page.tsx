'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, limit, startAfter, Timestamp, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, ChevronDown, Loader2, Shield } from 'lucide-react'
import Link from 'next/link'

interface AuditEntry {
  id: string
  action: string
  performedBy: string
  performedByEmail?: string
  targetId?: string
  targetType?: string
  details?: string
  timestamp: Date
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'player.delete': { label: 'Spieler gelöscht', color: 'bg-red-100 text-red-700' },
  'event.cancel': { label: 'Termin abgesagt', color: 'bg-amber-100 text-amber-700' },
  'invite.generate': { label: 'Einladung generiert', color: 'bg-blue-100 text-blue-700' },
  'admin.create': { label: 'Admin angelegt', color: 'bg-purple-100 text-purple-700' },
  'admin.delete': { label: 'Admin entfernt', color: 'bg-red-100 text-red-700' },
  'player.bulk_import': { label: 'Bulk-Import', color: 'bg-green-100 text-green-700' },
}

const PAGE_SIZE = 25

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<unknown>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filterAction, setFilterAction] = useState<string>('all')

  async function loadEntries(append = false) {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const ref = collection(db, 'clubs', CLUB_ID, 'auditLog')
      let constraints = [orderBy('timestamp', 'desc'), limit(PAGE_SIZE)]

      if (filterAction !== 'all') {
        constraints = [where('action', '==', filterAction), ...constraints]
      }

      if (append && lastDoc) {
        constraints.push(startAfter(lastDoc))
      }

      const q = query(ref, ...constraints)
      const snap = await getDocs(q)

      const newEntries = snap.docs.map(d => {
        const data = d.data()
        const ts = data.timestamp
        return {
          id: d.id,
          action: data.action,
          performedBy: data.performedBy,
          performedByEmail: data.performedByEmail,
          targetId: data.targetId,
          targetType: data.targetType,
          details: data.details,
          timestamp: ts instanceof Timestamp ? ts.toDate() : new Date(ts),
        } as AuditEntry
      })

      if (append) {
        setEntries(prev => [...prev, ...newEntries])
      } else {
        setEntries(newEntries)
      }

      setHasMore(snap.docs.length === PAGE_SIZE)
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
    } catch (err) {
      console.error('[AuditLog]', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [filterAction])

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Audit-Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Protokoll kritischer Admin-Aktionen</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setLastDoc(null) }}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle Aktionen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Aktionen</SelectItem>
            {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-lg">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Keine Audit-Einträge vorhanden.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y" style={{ borderRadius: '8px' }}>
          {entries.map(entry => {
            const actionInfo = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'bg-gray-100 text-gray-700' }
            return (
              <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-[10px] ${actionInfo.color} border-0`}>
                      {actionInfo.label}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {entry.timestamp.toLocaleDateString('de-AT', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {entry.details && (
                    <p className="text-sm text-gray-700">{entry.details}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    Von: {entry.performedByEmail ?? entry.performedBy.slice(0, 8) + '…'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="text-center mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEntries(true)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
            Mehr laden
          </Button>
        </div>
      )}
    </div>
  )
}

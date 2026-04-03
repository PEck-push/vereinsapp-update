/**
 * Audit log helper — writes critical admin actions to Firestore.
 * Server-side only (uses Admin SDK).
 */
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export type AuditAction =
  | 'player.delete'
  | 'event.cancel'
  | 'invite.generate'
  | 'admin.create'
  | 'admin.delete'
  | 'player.bulk_import'

interface AuditLogEntry {
  action: AuditAction
  performedBy: string
  performedByEmail?: string
  targetId?: string
  targetType?: 'player' | 'event' | 'admin' | 'bulk'
  details?: string
}

export async function writeAuditLog(clubId: string, entry: AuditLogEntry): Promise<void> {
  try {
    await adminDb
      .collection('clubs')
      .doc(clubId)
      .collection('auditLog')
      .add({
        ...entry,
        timestamp: FieldValue.serverTimestamp(),
      })
  } catch (error) {
    // Audit log should never block the main operation
    console.error('[auditLog] Failed to write:', error)
  }
}

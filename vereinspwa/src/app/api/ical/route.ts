/**
 * GET /api/ical?clubId=xxx&teamId=yyy (optional teamId)
 *
 * Returns an iCal (.ics) feed conforming to RFC 5545.
 * No auth required so external calendar apps can subscribe.
 * Club/team data is public by design for calendar use – no personal player data exposed.
 */
import { adminDb } from '@/lib/firebase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'

function formatICalDate(date: Date): string {
  // Format: 20240101T090000Z
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Spiel',
  meeting: 'Meeting',
  other: 'Termin',
}

interface ICalEvent {
  id: string
  title: string
  type: string
  startDate: Timestamp | string
  endDate?: Timestamp | string
  location?: string
  description?: string
  teamIds?: string[]
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const clubId = searchParams.get('clubId')
  const teamId = searchParams.get('teamId')

  if (!clubId) {
    return new NextResponse('clubId required', { status: 400 })
  }

  try {
    // Load club name
    const clubDoc = await adminDb.collection('clubs').doc(clubId).get()
    const clubName = clubDoc.exists ? (clubDoc.data()?.name ?? 'Verein') : 'Verein'

    // Load events
    let eventsQuery = adminDb
      .collection('clubs')
      .doc(clubId)
      .collection('events')
      .orderBy('startDate', 'asc')
      .limit(200) // Cap to avoid huge responses

    if (teamId) {
      eventsQuery = adminDb
        .collection('clubs')
        .doc(clubId)
        .collection('events')
        .where('teamIds', 'array-contains', teamId)
        .orderBy('startDate', 'asc')
        .limit(200) as typeof eventsQuery
    }

    const snap = await eventsQuery.get()
    const events: ICalEvent[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ICalEvent))

    // Build iCal
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//Vereinsmanager//DE`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeICalText(clubName)}${teamId ? ' – Team' : ''}`,
      'X-WR-TIMEZONE:Europe/Vienna',
    ]

    for (const event of events) {
      const startDate = event.startDate instanceof Timestamp
        ? event.startDate.toDate()
        : new Date(event.startDate)

      const endDate = event.endDate instanceof Timestamp
        ? event.endDate.toDate()
        : event.endDate
        ? new Date(event.endDate)
        : new Date(startDate.getTime() + 90 * 60 * 1000) // +90 min default

      const typeLabel = TYPE_LABELS[event.type] ?? 'Termin'
      const summary = `${typeLabel}: ${event.title}`

      lines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}@vereinsmanager`,
        `DTSTAMP:${formatICalDate(new Date())}`,
        `DTSTART:${formatICalDate(startDate)}`,
        `DTEND:${formatICalDate(endDate)}`,
        `SUMMARY:${escapeICalText(summary)}`,
      )

      if (event.location) {
        lines.push(`LOCATION:${escapeICalText(event.location)}`)
      }

      if (event.description) {
        // iCal line length limit: 75 chars, fold with CRLF + space
        const desc = `DESCRIPTION:${escapeICalText(event.description)}`
        // Simple fold at 75 chars
        if (desc.length > 75) {
          const folded = desc.match(/.{1,75}/g)?.join('\r\n ') ?? desc
          lines.push(folded)
        } else {
          lines.push(desc)
        }
      }

      lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')

    const icalContent = lines.join('\r\n')

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${clubName.replace(/\s+/g, '-')}.ics"`,
        'Cache-Control': 'max-age=3600', // Cache 1h
      },
    })
  } catch (error) {
    console.error('[ical] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
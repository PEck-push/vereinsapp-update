/**
 * GET /api/ical?clubId=xxx&teamId=yyy&token=zzz
 *
 * Returns an iCal (.ics) feed conforming to RFC 5545.
 *
 * SECURITY: Requires a valid `token` parameter that matches the
 * club's `settings.icalToken` in Firestore. This prevents unauthorized
 * access to event data — the token acts as a bearer secret in the URL.
 *
 * External calendar apps (Google Calendar, Apple Calendar, Outlook) can
 * subscribe using `webcal://` URLs that include this token.
 */
import { adminDb } from '@/lib/firebase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Spiel',
  meeting: 'Meeting',
  event: 'Vereins-Event',
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
  status?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const clubId = searchParams.get('clubId')
  const teamId = searchParams.get('teamId')
  const token = searchParams.get('token')

  if (!clubId) {
    return new NextResponse('clubId required', { status: 400 })
  }

  try {
    // ── Token validation ──
    const clubDoc = await adminDb.collection('clubs').doc(clubId).get()
    if (!clubDoc.exists) {
      return new NextResponse('Club not found', { status: 404 })
    }

    const clubData = clubDoc.data()!
    const clubName = clubData.name ?? 'Verein'
    const storedToken = clubData.settings?.icalToken

    if (!storedToken) {
      return new NextResponse(
        'iCal feed not configured. Generate a token in Settings → Kalender-Abos.',
        { status: 403 }
      )
    }

    if (!token || token !== storedToken) {
      return new NextResponse('Invalid or missing token', { status: 401 })
    }

    // ── Load events ──
    let eventsQuery = adminDb
      .collection('clubs')
      .doc(clubId)
      .collection('events')
      .orderBy('startDate', 'asc')
      .limit(500)

    if (teamId) {
      eventsQuery = adminDb
        .collection('clubs')
        .doc(clubId)
        .collection('events')
        .where('teamIds', 'array-contains', teamId)
        .orderBy('startDate', 'asc')
        .limit(500) as typeof eventsQuery
    }

    const snap = await eventsQuery.get()
    const events: ICalEvent[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ICalEvent))

    // Load team names for richer summaries
    const teamsSnap = await adminDb.collection('clubs').doc(clubId).collection('teams').get()
    const teamNames: Record<string, string> = {}
    teamsSnap.docs.forEach(d => { teamNames[d.id] = d.data().name })

    // ── Build iCal ──
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vereinsmanager//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeICalText(clubName)}${teamId ? ` – ${teamNames[teamId] ?? 'Team'}` : ''}`,
      'X-WR-TIMEZONE:Europe/Vienna',
    ]

    for (const event of events) {
      // Skip cancelled events in iCal feed
      if (event.status === 'cancelled') continue

      const startDate = event.startDate instanceof Timestamp
        ? event.startDate.toDate()
        : new Date(event.startDate)

      const endDate = event.endDate instanceof Timestamp
        ? event.endDate.toDate()
        : event.endDate
        ? new Date(event.endDate)
        : new Date(startDate.getTime() + 90 * 60 * 1000)

      const typeLabel = TYPE_LABELS[event.type] ?? 'Termin'
      const eventTeams = (event.teamIds ?? []).map(id => teamNames[id]).filter(Boolean).join(', ')
      const summary = eventTeams ? `${typeLabel}: ${event.title} (${eventTeams})` : `${typeLabel}: ${event.title}`

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
        const desc = `DESCRIPTION:${escapeICalText(event.description)}`
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
        'Cache-Control': 'max-age=3600',
      },
    })
  } catch (error) {
    console.error('[ical] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
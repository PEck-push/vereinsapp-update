/**
 * POST /api/oefbl/import
 *
 * Fetches match schedule from ÖFBL Spiele-Seite and creates events.
 * Body: { teamId: string, oefblUrl: string, clubName: string }
 * Returns: { imported: number, skipped: number, errors: string[] }
 *
 * Security: Admin-only.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { FieldValue } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { createHash } from 'crypto'

const ADMIN_ROLES = new Set(['admin', 'secretary', 'funktionaer', 'trainer'])

async function verifyAdmin(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const role = decoded.role as string | undefined
    if (role && ADMIN_ROLES.has(role)) return decoded.uid
    const cId = await getClubIdFromSession()
    if (!cId) return null
    const adminDoc = await adminDb
      .collection('clubs').doc(cId)
      .collection('adminUsers').doc(decoded.uid)
      .get()
    if (adminDoc.exists) {
      const docRole = adminDoc.data()?.role as string
      if (ADMIN_ROLES.has(docRole)) return decoded.uid
    }
    return null
  } catch {
    return null
  }
}

function generateMatchId(date: string, opponent: string): string {
  return createHash('md5').update(`${date}-${opponent}`).digest('hex').slice(0, 16)
}

interface ParsedMatch {
  date: Date
  homeTeam: string
  awayTeam: string
  location: string
  oefblMatchId: string
}

function parseOefblHtml(html: string, clubName: string): ParsedMatch[] {
  const $ = cheerio.load(html)
  const matches: ParsedMatch[] = []

  // ÖFBL tables use various structures — try common patterns
  // Pattern 1: Table rows with match data
  $('table tbody tr, .match-row, [class*="game"], [class*="match"]').each((_i, el) => {
    const cells = $(el).find('td')
    if (cells.length < 4) return

    const texts = cells.map((_j, c) => $(c).text().trim()).get()

    // Try to find date pattern (DD.MM.YYYY or DD.MM.YY)
    let dateStr = ''
    let timeStr = ''
    let homeTeam = ''
    let awayTeam = ''
    let location = ''

    for (const text of texts) {
      // Date pattern
      if (/^\d{2}\.\d{2}\.\d{2,4}$/.test(text)) {
        dateStr = text
      }
      // Time pattern
      if (/^\d{2}:\d{2}$/.test(text)) {
        timeStr = text
      }
    }

    // Try standard ÖFBL table: Date | Time | Home | Away | Location | Result
    if (texts.length >= 5) {
      if (!dateStr) dateStr = texts[0]
      if (!timeStr) timeStr = texts[1]
      homeTeam = texts[2]
      awayTeam = texts[3]
      location = texts.length > 4 ? texts[4] : ''
    }

    // Also try: Date | Home - Away | Location
    if (!homeTeam && texts.length >= 3) {
      const matchupText = texts.find(t => t.includes(' - ') || t.includes(' vs '))
      if (matchupText) {
        const parts = matchupText.split(/\s*[-–vs.]+\s*/)
        if (parts.length === 2) {
          homeTeam = parts[0].trim()
          awayTeam = parts[1].trim()
        }
      }
    }

    if (!dateStr || (!homeTeam && !awayTeam)) return

    // Parse date
    const dateParts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
    if (!dateParts) return

    let year = parseInt(dateParts[3])
    if (year < 100) year += 2000
    const month = parseInt(dateParts[2]) - 1
    const day = parseInt(dateParts[1])

    const [hours, minutes] = timeStr ? timeStr.split(':').map(Number) : [0, 0]
    const date = new Date(year, month, day, hours || 0, minutes || 0)

    if (isNaN(date.getTime())) return

    const oefblMatchId = generateMatchId(dateStr, `${homeTeam}-${awayTeam}`)

    matches.push({ date, homeTeam, awayTeam, location, oefblMatchId })
  })

  // If no structured table found, try parsing from text blocks
  if (matches.length === 0) {
    const text = $('body').text()
    const matchRegex = /(\d{2}\.\d{2}\.\d{2,4})\s+(\d{2}:\d{2})?\s*(.+?)\s*[-–]\s*(.+?)(?:\s+(\d+:\d+))?/g
    let match
    while ((match = matchRegex.exec(text)) !== null) {
      const dateParts = match[1].match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
      if (!dateParts) continue

      let year = parseInt(dateParts[3])
      if (year < 100) year += 2000

      const [hours, minutes] = match[2] ? match[2].split(':').map(Number) : [0, 0]
      const date = new Date(year, parseInt(dateParts[2]) - 1, parseInt(dateParts[1]), hours, minutes)
      if (isNaN(date.getTime())) continue

      matches.push({
        date,
        homeTeam: match[3].trim(),
        awayTeam: match[4].trim(),
        location: '',
        oefblMatchId: generateMatchId(match[1], `${match[3].trim()}-${match[4].trim()}`),
      })
    }
  }

  return matches
}

export async function POST(request: NextRequest) {
  const adminUid = await verifyAdmin()
  if (!adminUid) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const { teamId, oefblUrl, clubName } = await request.json()

    if (!teamId || !oefblUrl) {
      return NextResponse.json({ error: 'teamId und oefblUrl benötigt' }, { status: 400 })
    }

    // Validate URL
    if (!oefblUrl.includes('oefb.at') && !oefblUrl.includes('oefbl.at')) {
      return NextResponse.json({ error: 'Ungültige ÖFBL-URL' }, { status: 400 })
    }

    // Fetch the ÖFBL page
    let html: string
    try {
      const res = await fetch(oefblUrl, {
        headers: {
          'User-Agent': 'VereinsPWA/1.0 (Spielplan-Import)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        return NextResponse.json(
          { error: `ÖFBL-Seite nicht erreichbar (HTTP ${res.status})` },
          { status: 502 }
        )
      }

      html = await res.text()
    } catch (fetchError) {
      return NextResponse.json(
        { error: 'ÖFBL-Seite nicht erreichbar. Bitte URL prüfen und später versuchen.' },
        { status: 502 }
      )
    }

    // Parse matches
    const parsedMatches = parseOefblHtml(html, clubName || '')

    if (parsedMatches.length === 0) {
      return NextResponse.json(
        { error: 'Keine Spiele auf der Seite gefunden. Möglicherweise hat sich die HTML-Struktur geändert.' },
        { status: 422 }
      )
    }

    // Load existing events for duplicate check
    const existingSnap = await adminDb
      .collection('clubs').doc(clubId)
      .collection('events')
      .where('teamIds', 'array-contains', teamId)
      .where('type', '==', 'match')
      .select('oefblMatchId')
      .get()

    const existingMatchIds = new Set(
      existingSnap.docs.map(d => d.data().oefblMatchId).filter(Boolean)
    )

    // Create events
    const eventsRef = adminDb.collection('clubs').doc(clubId).collection('events')
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const batch = adminDb.batch()

    for (const match of parsedMatches) {
      // Duplicate check
      if (existingMatchIds.has(match.oefblMatchId)) {
        skipped++
        continue
      }

      // Determine home/away
      const isHome = match.homeTeam.toLowerCase().includes((clubName || '').toLowerCase())
      const opponent = isHome ? match.awayTeam : match.homeTeam

      try {
        const newRef = eventsRef.doc()
        batch.set(newRef, {
          title: `vs. ${opponent}`,
          type: 'match',
          status: 'scheduled',
          startDate: match.date,
          location: match.location || (isHome ? 'Heimspiel' : match.location),
          teamIds: [teamId],
          clubId: clubId,
          oefblMatchId: match.oefblMatchId,
          responseCount: { accepted: 0, declined: 0, total: 0 },
          createdBy: adminUid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        imported++
      } catch (err) {
        errors.push(`Fehler bei ${match.homeTeam} vs ${match.awayTeam}: ${(err as Error).message}`)
      }
    }

    if (imported > 0) {
      await batch.commit()
    }

    return NextResponse.json({ imported, skipped, errors, totalParsed: parsedMatches.length })
  } catch (error) {
    console.error('[oefbl/import POST]', error)
    return NextResponse.json(
      { error: 'Import fehlgeschlagen' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/oefbl/import
 *
 * Fetches match schedule from ÖFB/ÖFBL pages and creates events.
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

function parseOefblHtml(html: string, _clubName: string): ParsedMatch[] {
  const $ = cheerio.load(html)
  const matches: ParsedMatch[] = []

  // ─── Strategy 1: Table rows with match data ────────────────────────
  // Most ÖFB pages use <table> with <tbody> <tr> rows
  $('table tbody tr, table tr').each((_i, el) => {
    const cells = $(el).find('td, th')
    if (cells.length < 3) return

    const texts = cells.map((_j, c) => $(c).text().trim()).get()

    let dateStr = ''
    let timeStr = ''
    let homeTeam = ''
    let awayTeam = ''
    let location = ''

    // Search all cells for date and time patterns
    for (const text of texts) {
      if (/\d{2}\.\d{2}\.\d{2,4}/.test(text) && !dateStr) {
        const m = text.match(/(\d{2}\.\d{2}\.\d{2,4})/)
        if (m) dateStr = m[1]
      }
      if (/\d{1,2}:\d{2}/.test(text) && !timeStr) {
        const m = text.match(/(\d{1,2}:\d{2})/)
        if (m) timeStr = m[1]
      }
    }

    // Try: Date+Time combined in first cell (e.g. "Sa 05.04.2025 15:00")
    if (!dateStr && texts[0]) {
      const combined = texts[0].match(/(\d{2}\.\d{2}\.\d{2,4})\s*(\d{1,2}:\d{2})/)
      if (combined) {
        dateStr = combined[1]
        timeStr = combined[2]
      }
    }

    // Try to find team matchup: "Team A - Team B" or "Team A : Team B"
    for (const text of texts) {
      if (homeTeam) break
      // "Team A - Team B" pattern
      const vs = text.match(/^(.{3,40}?)\s*[-–:]\s*(.{3,40})$/)
      if (vs && !vs[1].match(/^\d/) && !vs[2].match(/^\d/)) {
        homeTeam = vs[1].trim()
        awayTeam = vs[2].trim()
      }
    }

    // Try standard column layout: cells[0]=Date, cells[1]=Time, cells[2]=Home, cells[3]=Away
    if (!homeTeam && texts.length >= 5) {
      if (!dateStr) dateStr = texts[0]
      if (!timeStr) timeStr = texts[1]
      homeTeam = texts[2]
      awayTeam = texts[3]
      if (texts.length > 4) location = texts[4]
    }

    // Try: cells[0]=Date/Time, cells[1]=Matchup, cells[2]=Location/Result
    if (!homeTeam && texts.length >= 2) {
      for (let k = 1; k < texts.length; k++) {
        const vs = texts[k].match(/^(.{3,40}?)\s*[-–:vs.]+\s*(.{3,40})$/)
        if (vs && !vs[1].match(/^\d{1,2}:\d{2}/) && !vs[2].match(/^\d{1,2}:\d{2}/)) {
          homeTeam = vs[1].trim()
          awayTeam = vs[2].trim()
          break
        }
      }
    }

    if (!dateStr || (!homeTeam && !awayTeam)) return

    const parsed = parseDate(dateStr, timeStr)
    if (!parsed) return

    const oefblMatchId = generateMatchId(dateStr, `${homeTeam}-${awayTeam}`)
    matches.push({ date: parsed, homeTeam, awayTeam, location, oefblMatchId })
  })

  // ─── Strategy 2: Div-based match cards ─────────────────────────────
  // Some ÖFB widget pages use div structures instead of tables
  if (matches.length === 0) {
    $('[class*="match"], [class*="game"], [class*="spiel"], [class*="fixture"], [class*="begegnung"]').each((_i, el) => {
      const text = $(el).text().trim()
      const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{2,4})/)
      const timeMatch = text.match(/(\d{1,2}:\d{2})/)

      // Find team names - look for specific child elements
      const teams = $(el).find('[class*="team"], [class*="mannschaft"], [class*="home"], [class*="away"], [class*="heim"], [class*="gast"]')
      let homeTeam = ''
      let awayTeam = ''

      if (teams.length >= 2) {
        homeTeam = $(teams[0]).text().trim()
        awayTeam = $(teams[1]).text().trim()
      } else {
        // Try to find "Team A - Team B" in text
        const vs = text.match(/([A-ZÄÖÜa-zäöüß\s.]+?)\s*[-–:]\s*([A-ZÄÖÜa-zäöüß\s.]+?)(?:\s|$)/)
        if (vs) {
          homeTeam = vs[1].trim()
          awayTeam = vs[2].trim()
        }
      }

      if (!dateMatch || !homeTeam) return

      const parsed = parseDate(dateMatch[1], timeMatch?.[1] || '')
      if (!parsed) return

      const oefblMatchId = generateMatchId(dateMatch[1], `${homeTeam}-${awayTeam}`)
      matches.push({ date: parsed, homeTeam, awayTeam, location: '', oefblMatchId })
    })
  }

  // ─── Strategy 3: Regex fallback on full text ───────────────────────
  if (matches.length === 0) {
    const fullText = $('body').text()
    // Pattern: "DD.MM.YYYY HH:MM Team A - Team B" or similar
    const patterns = [
      /(\d{2}\.\d{2}\.\d{2,4})\s+(\d{1,2}:\d{2})\s+(.{3,40}?)\s*[-–]\s*(.{3,40?})(?:\s+\d+:\d+)?/g,
      /(\d{2}\.\d{2}\.\d{2,4})\s*[,\s]+(\d{1,2}:\d{2})?\s*[,\s]*(.{3,40}?)\s*[-–:]\s*(.{3,40?})/g,
    ]

    for (const regex of patterns) {
      let m
      while ((m = regex.exec(fullText)) !== null) {
        const parsed = parseDate(m[1], m[2] || '')
        if (!parsed) continue

        const homeTeam = m[3].trim()
        const awayTeam = m[4].trim()
        if (homeTeam.length < 3 || awayTeam.length < 3) continue

        matches.push({
          date: parsed,
          homeTeam,
          awayTeam,
          location: '',
          oefblMatchId: generateMatchId(m[1], `${homeTeam}-${awayTeam}`),
        })
      }
      if (matches.length > 0) break
    }
  }

  return matches
}

function parseDate(dateStr: string, timeStr: string): Date | null {
  const dateParts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
  if (!dateParts) return null

  let year = parseInt(dateParts[3])
  if (year < 100) year += 2000
  const month = parseInt(dateParts[2]) - 1
  const day = parseInt(dateParts[1])

  let hours = 0, minutes = 0
  if (timeStr) {
    const timeParts = timeStr.split(':').map(Number)
    hours = timeParts[0] || 0
    minutes = timeParts[1] || 0
  }

  const date = new Date(year, month, day, hours, minutes)
  return isNaN(date.getTime()) ? null : date
}

// Allowed URL patterns
const ALLOWED_HOSTS = ['oefb.at', 'oefbl.at', 'fussballoesterreich.at']

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

    // Validate URL against allowed hosts
    let urlObj: URL
    try {
      urlObj = new URL(oefblUrl)
    } catch {
      return NextResponse.json({ error: 'Ungültige URL' }, { status: 400 })
    }

    const isAllowed = ALLOWED_HOSTS.some(h => urlObj.hostname.endsWith(h))
    if (!isAllowed) {
      return NextResponse.json(
        { error: `Ungültige URL. Erlaubte Domains: ${ALLOWED_HOSTS.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch the page with browser-like headers
    let html: string
    let fetchStatus: number
    try {
      const res = await fetch(oefblUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(20000),
      })

      fetchStatus = res.status
      if (!res.ok) {
        return NextResponse.json(
          { error: `ÖFB-Seite antwortet mit HTTP ${res.status}. Die Seite blockiert möglicherweise automatisierte Zugriffe. Versuche es mit dem manuellen Import.` },
          { status: 502 }
        )
      }

      html = await res.text()
    } catch {
      return NextResponse.json(
        { error: 'ÖFB-Seite nicht erreichbar. Bitte URL prüfen und später versuchen.' },
        { status: 502 }
      )
    }

    // Parse matches
    const parsedMatches = parseOefblHtml(html, clubName || '')

    if (parsedMatches.length === 0) {
      // Return debug info to help diagnose
      const $ = cheerio.load(html)
      const title = $('title').text().trim()
      const tableCount = $('table').length
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 300)

      return NextResponse.json(
        {
          error: 'Keine Spiele auf der Seite gefunden.',
          debug: {
            httpStatus: fetchStatus,
            pageTitle: title || '(kein Titel)',
            tablesFound: tableCount,
            textPreview: bodyText || '(kein Text)',
            hint: 'Die ÖFB-Seite verwendet möglicherweise JavaScript-Rendering (SPA). In diesem Fall funktioniert serverseitiges Parsing nicht. Bitte nutze den manuellen CSV-Import als Alternative.',
          },
        },
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
      if (existingMatchIds.has(match.oefblMatchId)) {
        skipped++
        continue
      }

      const isHome = match.homeTeam.toLowerCase().includes((clubName || '').toLowerCase())
      const opponent = isHome ? match.awayTeam : match.homeTeam

      try {
        const newRef = eventsRef.doc()
        batch.set(newRef, {
          title: `vs. ${opponent}`,
          type: 'match',
          status: 'scheduled',
          startDate: match.date,
          location: match.location || (isHome ? 'Heimspiel' : 'Auswärts'),
          teamIds: [teamId],
          clubId,
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

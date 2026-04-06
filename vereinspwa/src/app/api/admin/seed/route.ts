/**
 * /api/admin/seed
 *
 * POST   → Creates test data (all marked with _seed: true)
 * DELETE → Removes all _seed: true documents
 *
 * Uses EXISTING teams in the club — does NOT create new teams.
 * If no teams exist, creates default teams.
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getClubIdFromSession } from '@/lib/firebase/getClubIdFromSession'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// ─── Auth ─────────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['admin', 'secretary'])

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('__session')?.value
  if (!session) return false
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const uid = decoded.uid
    if (decoded.role && ADMIN_ROLES.has(decoded.role as string)) return true
    const cId = await getClubIdFromSession()
    if (!cId) return false
    const adminDoc = await adminDb.collection('clubs').doc(cId).collection('adminUsers').doc(uid).get()
    if (adminDoc.exists) {
      const role = adminDoc.data()?.role as string
      if (ADMIN_ROLES.has(role)) {
        await adminAuth.setCustomUserClaims(uid, { role, clubId: cId })
        return true
      }
    }
    return false
  } catch { return false }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const M = { _seed: true }

const FIRST_M = ['Lukas','Tobias','David','Felix','Maximilian','Sebastian','Alexander','Florian','Daniel','Moritz','Jonas','Elias','Leon','Luca','Paul','Jakob','Raphael','Simon','Fabian','Niklas','Marcel','Julian','Stefan','Andreas','Patrick','Christoph','Martin','Thomas','Manuel','Kevin']
const FIRST_F = ['Anna','Laura','Sarah','Lisa','Julia','Sophie','Lena','Hannah','Katharina','Christina','Nina','Eva','Marlene','Johanna','Clara']
const LASTS = ['Müller','Gruber','Huber','Wagner','Steiner','Berger','Bauer','Pichler','Moser','Mayer','Hofer','Leitner','Fischer','Brunner','Schwarz','Eder','Wolf','Lang','Maier','Aigner','Wimmer','Fuchs','Reiter','Koller','Haas','Wallner','Lechner','Kern','Holzer','Stadler']
const POS = ['Tormann','Abwehr','Abwehr','Abwehr','Mittelfeld','Mittelfeld','Mittelfeld','Sturm']
const OPP = ['SC Neudorf','SV Wieselburg','ASK Markt Piesting','FC Leobersdorf','SV Pottendorf','USC Kirchschlag']
const DECLINE = ['injury','work','private','private','other']

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a }
function addD(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function setT(d: Date, h: number, m: number) { const r = new Date(d); r.setHours(h, m, 0, 0); return r }
function getMon(d: Date) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0,0,0,0); return r }
function phone() { return `${pick(['0664','0650','0660','0676'])} ${rand(100,999)} ${rand(1000,9999)}` }

// ─── POST: Seed ───────────────────────────────────────────────────────────────

export async function POST() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    // Check if seed data already exists
    const existingCheck = await adminDb.collection('clubs').doc(clubId).collection('players').where('_seed', '==', true).limit(1).get()
    if (!existingCheck.empty) {
      return NextResponse.json({ error: 'Testdaten existieren bereits. Bitte zuerst löschen.' }, { status: 409 })
    }

    const clubRef = adminDb.collection('clubs').doc(clubId)
    const now = new Date()

    // 1. Use EXISTING teams — only create defaults if none exist
    const existingTeams = await clubRef.collection('teams').get()
    const teamIds: string[] = []
    let createdTeams = 0

    if (existingTeams.empty) {
      // No teams exist — create defaults
      const defaults = [
        { name: 'Kampfmannschaft', category: 'senior', color: '#1a1a2e' },
        { name: 'Reserve', category: 'senior', color: '#3B82F6' },
      ]
      for (const t of defaults) {
        const ref = await clubRef.collection('teams').add({ ...M, ...t, clubId, createdAt: FieldValue.serverTimestamp() })
        teamIds.push(ref.id)
        createdTeams++
      }
    } else {
      // Use existing teams
      existingTeams.docs.forEach(d => teamIds.push(d.id))
    }

    // Use first team for most data, second team if available
    const mainTeamId = teamIds[0]
    const secondTeamId = teamIds.length > 1 ? teamIds[1] : teamIds[0]

    // 2. Update club doc with seed mode flag
    await clubRef.set({ _seedMode: true }, { merge: true })

    // 3. Players — create for each team
    const players: { id: string; teamIdx: number }[] = []
    const used = new Set<string>()
    const playersPerTeam = Math.min(16, 30 / Math.max(teamIds.length, 1))

    for (let ti = 0; ti < Math.min(teamIds.length, 4); ti++) {
      const isLadies = ti >= 3
      const fNames = isLadies ? FIRST_F : FIRST_M
      const count = Math.round(playersPerTeam)

      for (let i = 0; i < count; i++) {
        let fn: string, ln: string, full: string
        do { fn = pick(fNames); ln = pick(LASTS); full = `${fn} ${ln}` } while (used.has(full))
        used.add(full)

        const tids = [teamIds[ti]]
        // Some players in both main and second team
        if (ti === 0 && Math.random() < 0.15 && teamIds.length > 1) tids.push(secondTeamId)

        const ref = await clubRef.collection('players').add({
          ...M, firstName: fn, lastName: ln,
          email: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[üöä]/g, c => ({ü:'ue',ö:'oe',ä:'ae'}[c]??c))}@testverein.at`,
          phone: phone(),
          dateOfBirth: new Date(now.getFullYear() - rand(18, 35), rand(0, 11), rand(1, 28)),
          jerseyNumber: i + 1, position: pick(POS), teamIds: tids,
          status: Math.random() < 0.08 ? 'injured' : 'active',
          clubId, accountStatus: 'active',
          inviteTokenUsed: false, fcmTokens: [], notificationPrefs: { push: true, email: true },
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        })
        players.push({ id: ref.id, teamIdx: ti })
      }
    }

    // 4. Past Trainings (last 6 weeks, Tue+Thu for first 2 teams)
    const evIds: { id: string; teamIdx: number; date: Date; type: string }[] = []

    for (let w = -6; w <= -1; w++) {
      const mon = addD(getMon(now), w * 7)
      for (let ti = 0; ti < Math.min(teamIds.length, 2); ti++) {
        for (const off of [1, 3]) {
          const d = setT(addD(mon, off), 18, 0)
          const ref = await clubRef.collection('events').add({
            ...M, title: 'Training', type: 'training', status: 'scheduled',
            startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 19, 30)),
            location: 'Sportplatz', teamIds: [teamIds[ti]], clubId,
            responseCount: { accepted: 0, declined: 0, total: 0 },
            createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          })
          evIds.push({ id: ref.id, teamIdx: ti, date: d, type: 'training' })
        }
      }
    }

    // 5. Past Matches (4 matches over the last 6 weeks)
    for (let i = 0; i < 4; i++) {
      const d = setT(addD(getMon(now), -(i + 1) * 14 + 5), 15, 0)
      const ref = await clubRef.collection('events').add({
        ...M, title: `Spiel vs. ${OPP[i]}`, type: 'match', status: 'scheduled',
        startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 17, 0)),
        location: i % 2 === 0 ? 'Sportplatz (Heim)' : OPP[i],
        teamIds: [mainTeamId], clubId,
        responseCount: { accepted: 0, declined: 0, total: 0 },
        createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      evIds.push({ id: ref.id, teamIdx: 0, date: d, type: 'match' })
    }

    // 6. Future events (next 2 weeks trainings + 1 match + 1 club event)
    for (let w = 0; w <= 1; w++) {
      const mon = addD(getMon(now), w * 7)
      for (let ti = 0; ti < Math.min(teamIds.length, 2); ti++) {
        for (const off of [1, 3]) {
          const d = setT(addD(mon, off), 18, 0)
          await clubRef.collection('events').add({
            ...M, title: 'Training', type: 'training', status: 'scheduled',
            startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 19, 30)),
            location: 'Sportplatz', teamIds: [teamIds[ti]], clubId,
            responseCount: { accepted: 0, declined: 0, total: 0 },
            createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }
    }

    // Future match
    await clubRef.collection('events').add({
      ...M, title: `Spiel vs. ${OPP[4]}`, type: 'match', status: 'scheduled',
      startDate: Timestamp.fromDate(setT(addD(now, 12), 16, 0)),
      endDate: Timestamp.fromDate(setT(addD(now, 12), 18, 0)),
      location: 'Sportplatz (Heim)', teamIds: [mainTeamId], clubId,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })

    // Club event
    await clubRef.collection('events').add({
      ...M, title: 'Saisoneröffnungsfeier', type: 'event', status: 'scheduled',
      startDate: Timestamp.fromDate(setT(addD(now, 21), 18, 0)),
      location: 'Vereinsheim', teamIds: [], clubId,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })

    // Cancelled event
    await clubRef.collection('events').add({
      ...M, title: 'Training (Platzsanierung)', type: 'training', status: 'cancelled',
      cancelReason: 'Platz wird saniert.',
      startDate: Timestamp.fromDate(setT(addD(now, 3), 18, 0)),
      teamIds: [mainTeamId], clubId,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })

    // 7. Responses on past events (mixed accepted/declined/open)
    let respCount = 0
    for (const ev of evIds) {
      const tp = players.filter(p => p.teamIdx === ev.teamIdx)
      let acc = 0, dec = 0, tot = 0
      for (const pl of tp) {
        // 25% no response (offen), 60% accepted, 15% declined
        const r = Math.random()
        if (r > 0.75) continue // offen
        const st = r < 0.60 ? 'accepted' : 'declined'
        const data: Record<string, unknown> = {
          ...M, playerId: pl.id, status: st,
          respondedAt: Timestamp.fromDate(addD(ev.date, -rand(0, 3))),
          source: Math.random() < 0.7 ? 'pwa' : 'telegram',
        }
        if (st === 'declined') { data.declineCategory = pick(DECLINE); dec++ } else { acc++ }
        tot++
        await clubRef.collection('events').doc(ev.id).collection('responses').doc(pl.id).set(data)
        respCount++
      }
      await clubRef.collection('events').doc(ev.id).update({
        'responseCount.accepted': acc,
        'responseCount.declined': dec,
        'responseCount.total': tot,
      })
    }

    // 8. Match reports with player stats
    const matchEvs = evIds.filter(e => e.type === 'match')
    const results = [[3, 1], [0, 2], [1, 1], [2, 0]]
    for (let i = 0; i < matchEvs.length; i++) {
      const tp = players.filter(p => p.teamIdx === matchEvs[i].teamIdx).slice(0, 14)
      if (tp.length < 11) continue

      await clubRef.collection('matchStats').add({
        ...M, eventId: matchEvs[i].id, teamId: mainTeamId, opponent: OPP[i],
        homeOrAway: i % 2 === 0 ? 'home' : 'away',
        result: { goalsFor: results[i][0], goalsAgainst: results[i][1] },
        playerMinutes: [
          ...tp.slice(0, 11).map(p => ({
            playerId: p.id, minuteIn: 0, minuteOut: 90, isStarter: true,
            goals: Math.random() < 0.2 ? 1 : 0,
            assists: Math.random() < 0.15 ? 1 : 0,
            yellowCards: Math.random() < 0.12 ? 1 : 0,
            redCard: false,
          })),
          ...tp.slice(11, 14).map(p => ({
            playerId: p.id, minuteIn: rand(55, 75), minuteOut: 90, isStarter: false,
            goals: 0, assists: 0, yellowCards: 0, redCard: false,
          })),
        ],
        clubId, createdAt: Timestamp.fromDate(matchEvs[i].date),
      })
    }

    return NextResponse.json({
      message: 'Testdaten erstellt',
      stats: {
        teamsUsed: teamIds.length,
        teamsCreated: createdTeams,
        players: players.length,
        events: evIds.length + 10,
        responses: respCount,
        matchReports: matchEvs.length,
      },
    })
  } catch (error) {
    console.error('[seed POST]', error)
    return NextResponse.json({ error: 'Seed fehlgeschlagen.' }, { status: 500 })
  }
}

// ─── DELETE: Reset ────────────────────────────────────────────────────────────

export async function DELETE() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const seedClubId = await getClubIdFromSession()
    if (!seedClubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const clubRef = adminDb.collection('clubs').doc(seedClubId)
    const subs = ['players', 'teams', 'events', 'matchStats', 'messages']
    let total = 0

    for (const sub of subs) {
      const snap = await clubRef.collection(sub).where('_seed', '==', true).get()
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = adminDb.batch()
        const chunk = snap.docs.slice(i, i + 400)
        for (const doc of chunk) {
          if (sub === 'events') {
            const rs = await doc.ref.collection('responses').get()
            rs.docs.forEach(r => batch.delete(r.ref))
            total += rs.docs.length
          }
          batch.delete(doc.ref)
        }
        await batch.commit()
      }
      total += snap.docs.length
    }

    // Remove seed mode flag
    const clubSnap = await clubRef.get()
    if (clubSnap.exists) {
      await clubRef.update({ _seedMode: FieldValue.delete() })
    }

    return NextResponse.json({ deleted: total, message: `${total} Testdokumente gelöscht.` })
  } catch (error) {
    console.error('[seed DELETE]', error)
    return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 })
  }
}

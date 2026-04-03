/**
 * /api/admin/seed
 *
 * POST   → Creates test data (all marked with _seed: true)
 * DELETE → Removes all _seed: true documents
 *
 * This replaces the CLI seed script for users who work
 * entirely through GitHub online / browser-based workflows.
 * Only accessible by admins.
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

    // First check custom claims (set by /api/admin/users)
    if (decoded.role && ADMIN_ROLES.has(decoded.role as string)) {
      return true
    }

    // Fallback: check Firestore adminUsers collection
    // (needed when admin was created manually in Firebase Console)
    const cId = await getClubIdFromSession()
    if (!cId) return false
    const adminDoc = await adminDb
      .collection('clubs').doc(cId)
      .collection('adminUsers').doc(uid)
      .get()

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

// ─── Seed Data ────────────────────────────────────────────────────────────────

const M = { _seed: true } // Marker on every document

const TEAMS = [
  { name: 'Herren 1', category: 'senior', color: '#1a1a2e' },
  { name: 'Herren 2', category: 'senior', color: '#3B82F6' },
  { name: 'U17', category: 'youth', color: '#10B981' },
  { name: 'Damen', category: 'ladies', color: '#8B5CF6' },
]

const FIRST_M = ['Lukas','Tobias','David','Felix','Maximilian','Sebastian','Alexander','Florian','Daniel','Moritz','Jonas','Elias','Leon','Luca','Paul','Jakob','Raphael','Simon','Fabian','Niklas','Marcel','Julian','Stefan','Andreas','Patrick','Christoph','Martin','Thomas','Manuel','Kevin','Marco','Dominik','Jan','Philipp','Michael','Bernhard']
const FIRST_F = ['Anna','Laura','Sarah','Lisa','Julia','Sophie','Lena','Hannah','Katharina','Christina','Nina','Eva','Marlene','Johanna','Clara']
const LASTS = ['Müller','Gruber','Huber','Wagner','Steiner','Berger','Bauer','Pichler','Moser','Mayer','Hofer','Leitner','Fischer','Brunner','Schwarz','Eder','Wolf','Lang','Maier','Aigner','Wimmer','Fuchs','Reiter','Koller','Haas','Wallner','Lechner','Kern','Holzer','Stadler','Brandner','Riegler','Strasser','Winter','Sommer','Hofmann','Bruckner','Auer','Traxler']
const POS = ['Tormann','Abwehr','Abwehr','Abwehr','Mittelfeld','Mittelfeld','Mittelfeld','Sturm']
const OPP = ['SC Neudorf','SV Wieselburg','ASK Markt Piesting','FC Leobersdorf']
const DECLINE = ['injury','work','private','private']

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
    const existingCheck = await adminDb.collection('clubs').doc(clubId).collection('teams').where('_seed', '==', true).limit(1).get()
    if (!existingCheck.empty) {
      return NextResponse.json({ error: 'Testdaten existieren bereits. Bitte zuerst löschen.' }, { status: 409 })
    }

    const clubRef = adminDb.collection('clubs').doc(clubId)
    const now = new Date()

    // 1. Update club doc with seed mode flag
    await clubRef.set({ _seedMode: true }, { merge: true })

    // 2. Teams
    const teamIds: string[] = []
    for (const t of TEAMS) {
      const ref = await clubRef.collection('teams').add({ ...M, ...t, clubId, createdAt: FieldValue.serverTimestamp() })
      teamIds.push(ref.id)
    }

    // 3. Players
    const players: { id: string; tIdxs: number[] }[] = []
    const used = new Set<string>()
    const sizes = [18, 14, 16, 14]

    for (let ti = 0; ti < 4; ti++) {
      const fNames = ti === 3 ? FIRST_F : FIRST_M
      for (let i = 0; i < sizes[ti]; i++) {
        let fn: string, ln: string, full: string
        do { fn = pick(fNames); ln = pick(LASTS); full = `${fn} ${ln}` } while (used.has(full))
        used.add(full)

        const tids = [teamIds[ti]]
        if (ti === 0 && Math.random() < 0.15) tids.push(teamIds[1])

        const ref = await clubRef.collection('players').add({
          ...M, firstName: fn, lastName: ln,
          email: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[üöä]/g, c => ({ü:'ue',ö:'oe',ä:'ae'}[c]??c))}@testverein.at`,
          phone: phone(),
          dateOfBirth: new Date(now.getFullYear() - rand(ti === 2 ? 14 : 18, ti === 2 ? 17 : 35), rand(0,11), rand(1,28)),
          jerseyNumber: i + 1, position: pick(POS), teamIds: tids,
          status: Math.random() < 0.08 ? 'injured' : 'active',
          clubId, accountStatus: Math.random() < 0.7 ? 'active' : 'invited',
          inviteTokenUsed: false, fcmTokens: [], notificationPrefs: { push: true, email: true },
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        })
        players.push({ id: ref.id, tIdxs: tids.map(t => teamIds.indexOf(t)) })
      }
    }

    // 4. Events + Responses
    const evIds: { id: string; tIdx: number; date: Date; type: string }[] = []

    // Past trainings (6 weeks, Tue+Thu, H1+H2)
    for (let w = -6; w <= -1; w++) {
      const mon = addD(getMon(now), w * 7)
      for (let ti = 0; ti < 2; ti++) {
        for (const off of [1, 3]) {
          const d = setT(addD(mon, off), 18, 0)
          const ref = await clubRef.collection('events').add({
            ...M, title: `Training ${TEAMS[ti].name}`, type: 'training', status: 'scheduled',
            startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 19, 30)),
            location: 'Sportplatz Hauptfeld', teamIds: [teamIds[ti]], clubId,
            responseCount: { accepted: 0, declined: 0, total: 0 },
            createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          })
          evIds.push({ id: ref.id, tIdx: ti, date: d, type: 'training' })
        }
      }
    }

    // Past matches
    for (let i = 0; i < 3; i++) {
      const d = setT(addD(getMon(now), -(i + 2) * 7 + 5), 15, 0)
      const ref = await clubRef.collection('events').add({
        ...M, title: `Spiel vs. ${OPP[i]}`, type: 'match', status: 'scheduled',
        startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 17, 0)),
        location: i % 2 === 0 ? 'Sportplatz Hauptfeld' : 'Auswärts',
        teamIds: [teamIds[0]], clubId,
        responseCount: { accepted: 0, declined: 0, total: 0 },
        createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      evIds.push({ id: ref.id, tIdx: 0, date: d, type: 'match' })
    }

    // Future events
    for (let w = 0; w <= 1; w++) {
      const mon = addD(getMon(now), w * 7)
      for (let ti = 0; ti < 2; ti++) {
        for (const off of [1, 3]) {
          const d = setT(addD(mon, off), 18, 0)
          await clubRef.collection('events').add({
            ...M, title: `Training ${TEAMS[ti].name}`, type: 'training', status: 'scheduled',
            startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setT(d, 19, 30)),
            location: 'Sportplatz Hauptfeld', teamIds: [teamIds[ti]], clubId,
            responseCount: { accepted: 0, declined: 0, total: 0 },
            createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }
    }

    // Club event + cancelled event
    await clubRef.collection('events').add({ ...M, title: 'Saisoneröffnungsfeier', type: 'event', status: 'scheduled', startDate: Timestamp.fromDate(setT(addD(now, 14), 18, 0)), location: 'Vereinsheim', teamIds: [], clubId, responseCount: { accepted: 0, declined: 0, total: 0 }, createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    await clubRef.collection('events').add({ ...M, title: 'Training (Platzsanierung)', type: 'training', status: 'cancelled', cancelReason: 'Platz wird saniert.', startDate: Timestamp.fromDate(setT(addD(now, 3), 18, 0)), teamIds: [teamIds[0]], clubId, responseCount: { accepted: 0, declined: 0, total: 0 }, createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })

    // Responses on past events
    let respCount = 0
    for (const ev of evIds) {
      const tp = players.filter(p => p.tIdxs.includes(ev.tIdx))
      let acc = 0, dec = 0, tot = 0
      for (const pl of tp) {
        if (Math.random() > 0.75) continue
        const st = Math.random() < 0.8 ? 'accepted' : 'declined'
        const data: Record<string, unknown> = { ...M, playerId: pl.id, status: st, respondedAt: Timestamp.fromDate(addD(ev.date, -rand(0, 2))), source: Math.random() < 0.7 ? 'pwa' : 'telegram' }
        if (st === 'declined') { data.declineCategory = pick(DECLINE); dec++ } else { acc++ }
        tot++
        await clubRef.collection('events').doc(ev.id).collection('responses').doc(pl.id).set(data)
        respCount++
      }
      await clubRef.collection('events').doc(ev.id).update({ 'responseCount.accepted': acc, 'responseCount.declined': dec, 'responseCount.total': tot })
    }

    // Match stats
    const matchEvs = evIds.filter(e => e.type === 'match').slice(0, 3)
    const results = [[3,1],[0,2],[1,1]]
    for (let i = 0; i < matchEvs.length; i++) {
      const tp = players.filter(p => p.tIdxs.includes(matchEvs[i].tIdx)).slice(0, 14)
      await clubRef.collection('matchStats').add({
        ...M, eventId: matchEvs[i].id, teamId: teamIds[0], opponent: OPP[i],
        homeOrAway: i % 2 === 0 ? 'home' : 'away',
        result: { goalsFor: results[i][0], goalsAgainst: results[i][1] },
        playerMinutes: [
          ...tp.slice(0, 11).map(p => ({ playerId: p.id, minuteIn: 0, minuteOut: 90, isStarter: true, goals: Math.random() < 0.15 ? 1 : 0, assists: Math.random() < 0.1 ? 1 : 0, yellowCards: Math.random() < 0.15 ? 1 : 0, redCard: false })),
          ...tp.slice(11, 14).map(p => ({ playerId: p.id, minuteIn: rand(55, 75), minuteOut: 90, isStarter: false, goals: 0, assists: 0, yellowCards: 0, redCard: false })),
        ],
        clubId, createdAt: Timestamp.fromDate(matchEvs[i].date),
      })
    }

    return NextResponse.json({
      message: 'Testdaten erstellt',
      stats: {
        teams: TEAMS.length,
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
    const subs = ['players', 'teams', 'events', 'adminUsers', 'matchStats', 'messages']
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
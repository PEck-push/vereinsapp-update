/**
 * /api/admin/seed
 *
 * POST   → Creates test data (all marked with _seed: true)
 * DELETE → Removes all _seed: true documents
 *
 * Uses EXISTING teams in the club — does NOT create new teams.
 * If no teams exist, creates default teams.
 *
 * All writes use Firestore batch operations to avoid timeouts.
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

const SEED = { _seed: true }

const FIRST_M = ['Lukas','Tobias','David','Felix','Maximilian','Sebastian','Alexander','Florian','Daniel','Moritz','Jonas','Elias','Leon','Luca','Paul','Jakob','Raphael','Simon','Fabian','Niklas','Marcel','Julian','Stefan','Andreas','Patrick','Christoph','Martin','Thomas','Manuel','Kevin']
const FIRST_F = ['Anna','Laura','Sarah','Lisa','Julia','Sophie','Lena','Hannah','Katharina','Christina','Nina','Eva','Marlene','Johanna','Clara']
const LASTS = ['Müller','Gruber','Huber','Wagner','Steiner','Berger','Bauer','Pichler','Moser','Mayer','Hofer','Leitner','Fischer','Brunner','Schwarz','Eder','Wolf','Lang','Maier','Aigner','Wimmer','Fuchs','Reiter','Koller','Haas','Wallner','Lechner','Kern','Holzer','Stadler']
const POS: Array<'Tormann'|'Abwehr'|'Mittelfeld'|'Sturm'> = ['Tormann','Abwehr','Abwehr','Abwehr','Mittelfeld','Mittelfeld','Mittelfeld','Sturm']
const OPP = ['SC Neudorf','SV Wieselburg','ASK Markt Piesting','FC Leobersdorf','SV Pottendorf','USC Kirchschlag']
const DECLINE_CATS = ['injury','work','private','private','other']

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function setTime(d: Date, h: number, m: number) { const r = new Date(d); r.setHours(h, m, 0, 0); return r }
function getMonday(d: Date) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0,0,0,0); return r }
function phone() { return `${pick(['0664','0650','0660','0676'])} ${rand(100,999)} ${rand(1000,9999)}` }
function umlauts(s: string) { return s.toLowerCase().replace(/[üöä]/g, c => ({ ü: 'ue', ö: 'oe', ä: 'ae' }[c] ?? c)) }

type BatchOp = { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }

/** Commit set operations in chunks of 450. */
async function commitBatches(ops: BatchOp[]) {
  const CHUNK = 450
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = adminDb.batch()
    for (const op of ops.slice(i, i + CHUNK)) {
      batch.set(op.ref, op.data)
    }
    await batch.commit()
  }
}

// ─── POST: Seed ───────────────────────────────────────────────────────────────

export async function POST() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const clubId = await getClubIdFromSession()
  if (!clubId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  try {
    const clubRef = adminDb.collection('clubs').doc(clubId)

    // Check if seed data already exists
    const existingCheck = await clubRef.collection('players').where('_seed', '==', true).limit(1).get()
    if (!existingCheck.empty) {
      return NextResponse.json({ error: 'Testdaten existieren bereits. Bitte zuerst löschen.' }, { status: 409 })
    }

    const now = new Date()

    // ── 1. Use EXISTING teams or create defaults ──
    const existingTeams = await clubRef.collection('teams').get()
    const teamIds: string[] = []
    let createdTeams = 0

    if (existingTeams.empty) {
      const defaults = [
        { name: 'Kampfmannschaft', category: 'senior', color: '#1a1a2e' },
        { name: 'Reserve', category: 'senior', color: '#3B82F6' },
      ]
      const teamBatch = adminDb.batch()
      for (const t of defaults) {
        const ref = clubRef.collection('teams').doc()
        teamBatch.set(ref, { ...SEED, ...t, clubId, createdAt: FieldValue.serverTimestamp() })
        teamIds.push(ref.id)
        createdTeams++
      }
      await teamBatch.commit()
    } else {
      existingTeams.docs.forEach(d => teamIds.push(d.id))
    }

    const mainTeamId = teamIds[0]
    const secondTeamId = teamIds.length > 1 ? teamIds[1] : teamIds[0]

    // Set seed mode flag
    await clubRef.set({ _seedMode: true }, { merge: true })

    // ── 2. Players ──
    const playerOps: BatchOp[] = []
    const players: { id: string; teamIdx: number }[] = []
    const usedNames = new Set<string>()
    const playersPerTeam = Math.min(16, Math.floor(30 / Math.max(teamIds.length, 1)))

    for (let ti = 0; ti < Math.min(teamIds.length, 4); ti++) {
      const firstNames = ti >= 3 ? FIRST_F : FIRST_M

      for (let i = 0; i < playersPerTeam; i++) {
        let fn: string, ln: string, full: string
        do { fn = pick(firstNames); ln = pick(LASTS); full = `${fn} ${ln}` } while (usedNames.has(full))
        usedNames.add(full)

        const tids = [teamIds[ti]]
        if (ti === 0 && Math.random() < 0.15 && teamIds.length > 1) tids.push(secondTeamId)

        const ref = clubRef.collection('players').doc()
        playerOps.push({
          ref,
          data: {
            ...SEED,
            firstName: fn, lastName: ln,
            email: `${umlauts(fn)}.${umlauts(ln)}@testverein.at`,
            phone: phone(),
            dateOfBirth: new Date(now.getFullYear() - rand(18, 35), rand(0, 11), rand(1, 28)),
            jerseyNumber: i + 1, position: pick(POS), teamIds: tids,
            status: Math.random() < 0.08 ? 'injured' : 'active',
            clubId, accountStatus: 'active',
            inviteTokenUsed: false, fcmTokens: [],
            notificationPrefs: { push: true, email: true },
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          },
        })
        players.push({ id: ref.id, teamIdx: ti })
      }
    }

    await commitBatches(playerOps)

    // ── 3. Events ──
    const eventOps: BatchOp[] = []
    const pastEvents: { id: string; teamIdx: number; date: Date; type: string }[] = []

    // Past trainings: 6 weeks, Tue+Thu for first 2 teams
    for (let w = -6; w <= -1; w++) {
      const mon = addDays(getMonday(now), w * 7)
      for (let ti = 0; ti < Math.min(teamIds.length, 2); ti++) {
        for (const dayOff of [1, 3]) {
          const d = setTime(addDays(mon, dayOff), 18, 0)
          const ref = clubRef.collection('events').doc()
          eventOps.push({
            ref,
            data: {
              ...SEED, title: 'Training', type: 'training', status: 'scheduled',
              startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 19, 30)),
              location: 'Sportplatz', teamIds: [teamIds[ti]], clubId,
              responseCount: { accepted: 0, declined: 0, total: 0 },
              createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            },
          })
          pastEvents.push({ id: ref.id, teamIdx: ti, date: d, type: 'training' })
        }
      }
    }

    // Past matches: 4 on Saturdays
    for (let i = 0; i < 4; i++) {
      const d = setTime(addDays(getMonday(now), -(i + 1) * 14 + 5), 15, 0)
      const ref = clubRef.collection('events').doc()
      eventOps.push({
        ref,
        data: {
          ...SEED, title: `Spiel vs. ${OPP[i]}`, type: 'match', status: 'scheduled',
          startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 17, 0)),
          location: i % 2 === 0 ? 'Sportplatz (Heim)' : OPP[i],
          teamIds: [mainTeamId], clubId,
          responseCount: { accepted: 0, declined: 0, total: 0 },
          createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        },
      })
      pastEvents.push({ id: ref.id, teamIdx: 0, date: d, type: 'match' })
    }

    // Future trainings: next 2 weeks
    for (let w = 0; w <= 1; w++) {
      const mon = addDays(getMonday(now), w * 7)
      for (let ti = 0; ti < Math.min(teamIds.length, 2); ti++) {
        for (const dayOff of [1, 3]) {
          const d = setTime(addDays(mon, dayOff), 18, 0)
          eventOps.push({
            ref: clubRef.collection('events').doc(),
            data: {
              ...SEED, title: 'Training', type: 'training', status: 'scheduled',
              startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 19, 30)),
              location: 'Sportplatz', teamIds: [teamIds[ti]], clubId,
              responseCount: { accepted: 0, declined: 0, total: 0 },
              createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            },
          })
        }
      }
    }

    // Future match
    eventOps.push({
      ref: clubRef.collection('events').doc(),
      data: {
        ...SEED, title: `Spiel vs. ${OPP[4]}`, type: 'match', status: 'scheduled',
        startDate: Timestamp.fromDate(setTime(addDays(now, 12), 16, 0)),
        endDate: Timestamp.fromDate(setTime(addDays(now, 12), 18, 0)),
        location: 'Sportplatz (Heim)', teamIds: [mainTeamId], clubId,
        responseCount: { accepted: 0, declined: 0, total: 0 },
        createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      },
    })

    // Club event
    eventOps.push({
      ref: clubRef.collection('events').doc(),
      data: {
        ...SEED, title: 'Saisoneröffnungsfeier', type: 'event', status: 'scheduled',
        startDate: Timestamp.fromDate(setTime(addDays(now, 21), 18, 0)),
        location: 'Vereinsheim', teamIds: [], clubId,
        responseCount: { accepted: 0, declined: 0, total: 0 },
        createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      },
    })

    // Cancelled event
    eventOps.push({
      ref: clubRef.collection('events').doc(),
      data: {
        ...SEED, title: 'Training (Platzsanierung)', type: 'training', status: 'cancelled',
        cancelReason: 'Platz wird saniert.',
        startDate: Timestamp.fromDate(setTime(addDays(now, 3), 18, 0)),
        teamIds: [mainTeamId], clubId,
        responseCount: { accepted: 0, declined: 0, total: 0 },
        createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      },
    })

    await commitBatches(eventOps)

    // ── 4. Responses on past events ──
    const responseOps: BatchOp[] = []
    const countUpdates: { eventId: string; acc: number; dec: number; tot: number }[] = []

    for (const ev of pastEvents) {
      const tp = players.filter(p => p.teamIdx === ev.teamIdx)
      let acc = 0, dec = 0, tot = 0

      for (const pl of tp) {
        const r = Math.random()
        if (r > 0.75) continue // 25% no response

        const status = r < 0.60 ? 'accepted' : 'declined'
        const data: Record<string, unknown> = {
          ...SEED, playerId: pl.id, status,
          respondedAt: Timestamp.fromDate(addDays(ev.date, -rand(0, 3))),
          source: Math.random() < 0.7 ? 'pwa' : 'telegram',
        }
        if (status === 'declined') { data.declineCategory = pick(DECLINE_CATS); dec++ } else { acc++ }
        tot++

        responseOps.push({
          ref: clubRef.collection('events').doc(ev.id).collection('responses').doc(pl.id),
          data,
        })
      }

      countUpdates.push({ eventId: ev.id, acc, dec, tot })
    }

    await commitBatches(responseOps)

    // Update responseCount on each past event
    for (let i = 0; i < countUpdates.length; i += 450) {
      const batch = adminDb.batch()
      for (const u of countUpdates.slice(i, i + 450)) {
        batch.update(clubRef.collection('events').doc(u.eventId), {
          'responseCount.accepted': u.acc,
          'responseCount.declined': u.dec,
          'responseCount.total': u.tot,
        })
      }
      await batch.commit()
    }

    // ── 5. Match reports ──
    const matchEvs = pastEvents.filter(e => e.type === 'match')
    const scores = [[3, 1], [0, 2], [1, 1], [2, 0]]
    const matchOps: BatchOp[] = []

    for (let i = 0; i < matchEvs.length; i++) {
      const tp = players.filter(p => p.teamIdx === matchEvs[i].teamIdx).slice(0, 14)
      if (tp.length < 11) continue

      matchOps.push({
        ref: clubRef.collection('matchStats').doc(),
        data: {
          ...SEED, eventId: matchEvs[i].id, teamId: mainTeamId, opponent: OPP[i],
          homeOrAway: i % 2 === 0 ? 'home' : 'away',
          result: { goalsFor: scores[i][0], goalsAgainst: scores[i][1] },
          playerMinutes: [
            ...tp.slice(0, 11).map(p => ({
              playerId: p.id, minuteIn: 0, minuteOut: 90, isStarter: true,
              goals: Math.random() < 0.2 ? 1 : 0, assists: Math.random() < 0.15 ? 1 : 0,
              yellowCards: Math.random() < 0.12 ? 1 : 0, redCard: false,
            })),
            ...tp.slice(11, 14).map(p => ({
              playerId: p.id, minuteIn: rand(55, 75), minuteOut: 90, isStarter: false,
              goals: 0, assists: 0, yellowCards: 0, redCard: false,
            })),
          ],
          clubId, createdAt: Timestamp.fromDate(matchEvs[i].date),
        },
      })
    }

    await commitBatches(matchOps)

    return NextResponse.json({
      message: 'Testdaten erstellt',
      stats: {
        teamsUsed: teamIds.length,
        teamsCreated: createdTeams,
        players: players.length,
        events: eventOps.length,
        responses: responseOps.length,
        matchReports: matchOps.length,
      },
    })
  } catch (error) {
    console.error('[seed POST]', error)
    return NextResponse.json({ error: `Seed fehlgeschlagen: ${(error as Error).message}` }, { status: 500 })
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

#!/usr/bin/env ts-node
/**
 * Seed Script v2 — Testdaten mit _seed:true Markierung.
 *
 * Usage:
 *   npm run seed          # Seed einspielen
 *   npm run seed:reset    # Alle _seed:true Daten löschen
 *
 * Every seeded document gets { _seed: true } so it's clearly
 * identifiable in the Firebase Console and deletable without
 * touching real production data.
 */

import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUB_ID = process.env.NEXT_PUBLIC_CLUB_ID ?? 'default-club'
const MODE = process.argv[2] // 'reset' or undefined

/** Marker added to every seeded document */
const SEED_MARKER = { _seed: true }

const SEED_ADMIN = {
  email: 'admin@testverein.at',
  password: 'Test1234!',
  displayName: 'Max Obmann',
}

const SEED_TRAINERS = [
  { email: 'trainer1@testverein.at', password: 'Test1234!', displayName: 'Stefan Kovacs', teamIndex: 0 },
  { email: 'trainer2@testverein.at', password: 'Test1234!', displayName: 'Maria Wimmer', teamIndex: 3 },
]

// ─── Init ─────────────────────────────────────────────────────────────────────

function initAdmin(): admin.app.App {
  if (admin.apps.length > 0) return admin.app()
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Firebase Admin env vars fehlen (FIREBASE_ADMIN_PROJECT_ID, _CLIENT_EMAIL, _PRIVATE_KEY)')
    process.exit(1)
  }
  return admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) })
}

const app = initAdmin()
const db = admin.firestore()
const auth = getAuth(app)

// ─── Data ─────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: 'Herren 1', category: 'senior', color: '#1a1a2e' },
  { name: 'Herren 2', category: 'senior', color: '#3B82F6' },
  { name: 'U17', category: 'youth', color: '#10B981' },
  { name: 'Damen', category: 'ladies', color: '#8B5CF6' },
]

const FIRST_NAMES_M = [
  'Lukas', 'Tobias', 'David', 'Felix', 'Maximilian', 'Sebastian', 'Alexander',
  'Florian', 'Daniel', 'Moritz', 'Jonas', 'Elias', 'Leon', 'Luca', 'Paul',
  'Jakob', 'Raphael', 'Simon', 'Fabian', 'Niklas', 'Marcel', 'Julian',
  'Stefan', 'Andreas', 'Patrick', 'Christoph', 'Martin', 'Thomas', 'Manuel',
  'Kevin', 'Marco', 'Dominik', 'Jan', 'Philipp', 'Michael', 'Bernhard',
]
const FIRST_NAMES_F = [
  'Anna', 'Laura', 'Sarah', 'Lisa', 'Julia', 'Sophie', 'Lena', 'Hannah',
  'Katharina', 'Christina', 'Nina', 'Eva', 'Marlene', 'Johanna', 'Clara',
]
const LAST_NAMES = [
  'Müller', 'Gruber', 'Huber', 'Wagner', 'Steiner', 'Berger', 'Bauer',
  'Pichler', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Fischer', 'Brunner',
  'Schwarz', 'Eder', 'Wolf', 'Lang', 'Maier', 'Aigner', 'Wimmer',
  'Fuchs', 'Reiter', 'Koller', 'Haas', 'Wallner', 'Lechner', 'Kern',
  'Holzer', 'Stadler', 'Brandner', 'Riegler', 'Strasser', 'Winter',
  'Sommer', 'Hofmann', 'Bruckner', 'Auer', 'Traxler', 'Zöhrer',
]

const POSITIONS = ['Tormann', 'Abwehr', 'Abwehr', 'Abwehr', 'Mittelfeld', 'Mittelfeld', 'Mittelfeld', 'Sturm']
const OPPONENTS = ['SC Neudorf', 'SV Wieselburg', 'ASK Markt Piesting', 'FC Leobersdorf']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function phoneNumber(): string {
  const prefixes = ['0664', '0650', '0660', '0676', '0680', '0699']
  return `${pick(prefixes)} ${rand(100, 999)} ${rand(1000, 9999)}`
}
function dateOfBirth(minAge: number, maxAge: number): Date {
  const year = new Date().getFullYear() - rand(minAge, maxAge)
  return new Date(year, rand(0, 11), rand(1, 28))
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function setTime(d: Date, h: number, m: number): Date { const r = new Date(d); r.setHours(h, m, 0, 0); return r }
function getMonday(d: Date): Date {
  const date = new Date(d); const day = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); date.setHours(0, 0, 0, 0); return date
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding Firestore (mit _seed:true Markierung)...')
  console.log(`   Club ID: ${CLUB_ID}\n`)

  const clubRef = db.collection('clubs').doc(CLUB_ID)

  // ── 1. Club ──
  console.log('1/7  Club...')
  await clubRef.set({
    ...SEED_MARKER,
    name: 'ASV Musterstadt',
    primaryColor: '#1a1a2e',
    secondaryColor: '#e94560',
    logoUrl: '',
    _seedMode: true, // Extra flag on club doc: used by the app to show the banner
    settings: { timezone: 'Europe/Vienna', defaultSport: 'football', seasonStartMonth: 6 },
    createdAt: FieldValue.serverTimestamp(),
  })

  // ── 2. Teams ──
  console.log('2/7  Teams...')
  const teamIds: string[] = []
  for (const team of TEAMS) {
    const ref = await clubRef.collection('teams').add({
      ...SEED_MARKER, ...team, clubId: CLUB_ID, createdAt: FieldValue.serverTimestamp(),
    })
    teamIds.push(ref.id)
  }

  // ── 3. Players ──
  console.log('3/7  Spieler...')
  const playerIds: { id: string; teamIdxs: number[]; name: string }[] = []
  const usedNames = new Set<string>()
  const teamSizes = [18, 14, 16, 14]

  for (let tIdx = 0; tIdx < TEAMS.length; tIdx++) {
    const size = teamSizes[tIdx]
    const isFemale = tIdx === 3
    const firstNames = isFemale ? FIRST_NAMES_F : FIRST_NAMES_M
    const ageRange: [number, number] = tIdx === 2 ? [14, 17] : [18, 35]

    for (let i = 0; i < size; i++) {
      let firstName: string, lastName: string, fullName: string
      do {
        firstName = pick(firstNames); lastName = pick(LAST_NAMES); fullName = `${firstName} ${lastName}`
      } while (usedNames.has(fullName))
      usedNames.add(fullName)

      const teamAssignments = [teamIds[tIdx]]
      if (tIdx === 0 && Math.random() < 0.15 && teamIds[1]) teamAssignments.push(teamIds[1])

      const ref = await clubRef.collection('players').add({
        ...SEED_MARKER,
        firstName, lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[üöä]/g, c => ({ü:'ue',ö:'oe',ä:'ae'}[c] ?? c))}@testverein.at`,
        phone: phoneNumber(),
        dateOfBirth: dateOfBirth(ageRange[0], ageRange[1]),
        jerseyNumber: i + 1,
        position: pick(POSITIONS),
        teamIds: teamAssignments,
        status: Math.random() < 0.08 ? 'injured' : 'active',
        clubId: CLUB_ID,
        accountStatus: Math.random() < 0.7 ? 'active' : 'invited',
        inviteTokenUsed: false, fcmTokens: [],
        notificationPrefs: { push: true, email: true },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      playerIds.push({ id: ref.id, teamIdxs: teamAssignments.map(tid => teamIds.indexOf(tid)), name: fullName })
    }
  }
  console.log(`     ${playerIds.length} Spieler`)

  // ── 4. Auth Accounts ──
  console.log('4/7  Auth-Accounts...')
  async function createAuth(email: string, password: string, displayName: string, role: string, uTeamIds: string[]) {
    let uid: string
    try { uid = (await auth.getUserByEmail(email)).uid } catch { uid = (await auth.createUser({ email, password, displayName })).uid }
    await auth.setCustomUserClaims(uid, { role, clubId: CLUB_ID })
    await clubRef.collection('adminUsers').doc(uid).set({
      ...SEED_MARKER, uid, role, teamIds: uTeamIds, createdAt: FieldValue.serverTimestamp(),
    })
  }
  await createAuth(SEED_ADMIN.email, SEED_ADMIN.password, SEED_ADMIN.displayName, 'admin', [])
  for (const t of SEED_TRAINERS) await createAuth(t.email, t.password, t.displayName, 'trainer', [teamIds[t.teamIndex]])

  // ── 5. Events ──
  console.log('5/7  Events...')
  const now = new Date()
  const eventIds: { id: string; teamIdx: number; startDate: Date; type: string }[] = []

  // Past trainings: 8 weeks, Tue+Thu, H1+H2
  for (let week = -8; week <= -1; week++) {
    const mon = addDays(getMonday(now), week * 7)
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      for (const dayOff of [1, 3]) {
        const d = setTime(addDays(mon, dayOff), 18, 0)
        const ref = await clubRef.collection('events').add({
          ...SEED_MARKER,
          title: `Training ${TEAMS[tIdx].name}`, type: 'training', status: 'scheduled',
          startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 19, 30)),
          location: 'Sportplatz Hauptfeld', teamIds: [teamIds[tIdx]], clubId: CLUB_ID,
          responseCount: { accepted: 0, declined: 0, total: 0 },
          createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        })
        eventIds.push({ id: ref.id, teamIdx: tIdx, startDate: d, type: 'training' })
      }
    }
  }

  // Past matches
  for (let i = 0; i < 4; i++) {
    const d = setTime(addDays(getMonday(now), -(i + 2) * 7 + 5), 15, 0)
    const ref = await clubRef.collection('events').add({
      ...SEED_MARKER,
      title: `Spiel vs. ${OPPONENTS[i]}`, type: 'match', status: 'scheduled',
      startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 17, 0)),
      location: i % 2 === 0 ? 'Sportplatz Hauptfeld' : 'Auswärts',
      teamIds: [teamIds[0]], clubId: CLUB_ID,
      responseCount: { accepted: 0, declined: 0, total: 0 },
      createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    eventIds.push({ id: ref.id, teamIdx: 0, startDate: d, type: 'match' })
  }

  // Future trainings: 2 weeks
  for (let week = 0; week <= 1; week++) {
    const mon = addDays(getMonday(now), week * 7)
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      for (const dayOff of [1, 3]) {
        const d = setTime(addDays(mon, dayOff), 18, 0)
        await clubRef.collection('events').add({
          ...SEED_MARKER,
          title: `Training ${TEAMS[tIdx].name}`, type: 'training', status: 'scheduled',
          startDate: Timestamp.fromDate(d), endDate: Timestamp.fromDate(setTime(d, 19, 30)),
          location: 'Sportplatz Hauptfeld', teamIds: [teamIds[tIdx]], clubId: CLUB_ID,
          responseCount: { accepted: 0, declined: 0, total: 0 },
          createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }
  }

  // Future match + club event + cancelled
  await clubRef.collection('events').add({ ...SEED_MARKER, title: 'Spiel vs. USV Schlaining', type: 'match', status: 'scheduled', startDate: Timestamp.fromDate(setTime(addDays(getMonday(now), 5), 15, 0)), location: 'Sportplatz Hauptfeld', teamIds: [teamIds[0]], clubId: CLUB_ID, responseCount: { accepted: 0, declined: 0, total: 0 }, createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await clubRef.collection('events').add({ ...SEED_MARKER, title: 'Saisoneröffnungsfeier', type: 'event', status: 'scheduled', startDate: Timestamp.fromDate(setTime(addDays(now, 14), 18, 0)), endDate: Timestamp.fromDate(setTime(addDays(now, 14), 22, 0)), location: 'Vereinsheim', teamIds: [], clubId: CLUB_ID, responseCount: { accepted: 0, declined: 0, total: 0 }, createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await clubRef.collection('events').add({ ...SEED_MARKER, title: 'Training (Platzsanierung)', type: 'training', status: 'cancelled', cancelReason: 'Platz wird saniert.', startDate: Timestamp.fromDate(setTime(addDays(now, 3), 18, 0)), teamIds: [teamIds[0]], clubId: CLUB_ID, responseCount: { accepted: 0, declined: 0, total: 0 }, createdBy: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })

  console.log(`     ${eventIds.length + 11} Events`)

  // ── 6. Responses ──
  console.log('6/7  Responses...')
  const declineCats = ['injury', 'work', 'private', 'private']
  let totalResp = 0

  for (const event of eventIds) {
    const teamPlayers = playerIds.filter(p => p.teamIdxs.includes(event.teamIdx))
    let accepted = 0, declined = 0, total = 0

    for (const player of teamPlayers) {
      if (Math.random() > 0.75) continue
      const status = Math.random() < 0.8 ? 'accepted' : 'declined'
      const data: Record<string, unknown> = {
        ...SEED_MARKER, playerId: player.id, status,
        respondedAt: Timestamp.fromDate(addDays(event.startDate, -rand(0, 3))),
        source: Math.random() < 0.7 ? 'pwa' : 'telegram',
      }
      if (status === 'declined') { data.declineCategory = pick(declineCats); declined++ } else { accepted++ }
      total++

      await clubRef.collection('events').doc(event.id).collection('responses').doc(player.id).set(data)
      totalResp++
    }
    await clubRef.collection('events').doc(event.id).update({
      'responseCount.accepted': accepted, 'responseCount.declined': declined, 'responseCount.total': total,
    })
  }
  console.log(`     ${totalResp} Responses`)

  // ── 7. Match Stats ──
  console.log('7/7  Spielberichte...')
  const matchEvents = eventIds.filter(e => e.type === 'match').slice(0, 3)
  const results = [[3, 1], [0, 2], [1, 1]]

  for (let i = 0; i < matchEvents.length; i++) {
    const ev = matchEvents[i]
    const tp = playerIds.filter(p => p.teamIdxs.includes(ev.teamIdx)).slice(0, 16)
    const playerMinutes = [
      ...tp.slice(0, 11).map(p => ({
        playerId: p.id, minuteIn: 0, minuteOut: Math.random() < 0.8 ? 90 : rand(60, 85),
        isStarter: true, goals: Math.random() < 0.15 ? 1 : 0, assists: Math.random() < 0.1 ? 1 : 0,
        yellowCards: Math.random() < 0.15 ? 1 : 0, redCard: false,
      })),
      ...tp.slice(11, 14).map(p => ({
        playerId: p.id, minuteIn: rand(55, 75), minuteOut: 90, isStarter: false,
        goals: 0, assists: Math.random() < 0.1 ? 1 : 0, yellowCards: 0, redCard: false,
      })),
    ]
    await clubRef.collection('matchStats').add({
      ...SEED_MARKER, eventId: ev.id, teamId: teamIds[ev.teamIdx],
      opponent: OPPONENTS[i], homeOrAway: i % 2 === 0 ? 'home' : 'away',
      result: { goalsFor: results[i][0], goalsAgainst: results[i][1] },
      playerMinutes, clubId: CLUB_ID, createdAt: Timestamp.fromDate(ev.startDate),
    })
  }

  console.log('\n' + '='.repeat(50))
  console.log('  TESTMODUS AKTIV')
  console.log('  Alle Dokumente sind mit _seed:true markiert.')
  console.log('='.repeat(50))
  console.log(`\n  Admin:    ${SEED_ADMIN.email} / ${SEED_ADMIN.password}`)
  SEED_TRAINERS.forEach(t => console.log(`  Trainer:  ${t.email} / ${t.password}`))
  console.log(`\n  In der App: Banner oben zeigt "Testmodus" mit Lösch-Button.\n`)
}

// ─── Reset (nur _seed:true Dokumente) ─────────────────────────────────────────

async function reset() {
  console.log('🗑️  Lösche nur _seed:true Dokumente...')
  console.log(`   Club ID: ${CLUB_ID}\n`)

  const clubRef = db.collection('clubs').doc(CLUB_ID)
  const subs = ['players', 'teams', 'events', 'adminUsers', 'playerUids', 'matchStats', 'messages']
  let totalDeleted = 0

  for (const sub of subs) {
    const snap = await clubRef.collection(sub).where('_seed', '==', true).get()
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch()
      const chunk = snap.docs.slice(i, i + 400)
      for (const doc of chunk) {
        if (sub === 'events') {
          const respSnap = await doc.ref.collection('responses').where('_seed', '==', true).get()
          respSnap.docs.forEach(r => batch.delete(r.ref))
          totalDeleted += respSnap.docs.length
        }
        batch.delete(doc.ref)
      }
      await batch.commit()
    }
    if (snap.docs.length > 0) console.log(`   ${sub}: ${snap.docs.length} gelöscht`)
    totalDeleted += snap.docs.length
  }

  // Remove _seedMode flag from club doc (but don't delete the club itself if it has real data)
  const clubSnap = await clubRef.get()
  if (clubSnap.exists && clubSnap.data()?._seed === true) {
    await clubRef.delete()
    console.log('   Club-Dokument gelöscht (war Seed)')
  } else if (clubSnap.exists) {
    await clubRef.update({ _seedMode: admin.firestore.FieldValue.delete() })
    console.log('   _seedMode Flag entfernt')
  }

  // Delete seed auth accounts
  const seedEmails = [SEED_ADMIN.email, ...SEED_TRAINERS.map(t => t.email)]
  for (const email of seedEmails) {
    try {
      const user = await auth.getUserByEmail(email)
      await auth.deleteUser(user.uid)
      console.log(`   Auth: ${email} gelöscht`)
    } catch { /* doesn't exist */ }
  }

  console.log(`\n  ${totalDeleted} Dokumente insgesamt gelöscht.\n`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (MODE === 'reset') await reset(); else await seed()
  } catch (err) { console.error('❌', err); process.exit(1) }
  process.exit(0)
}
main()
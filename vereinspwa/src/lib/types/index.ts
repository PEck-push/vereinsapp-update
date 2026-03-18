export interface Club {
  id: string
  name: string
  slug: string
  logoUrl?: string
  createdAt: Date
  settings: {
    timezone: string
    defaultSport: string
  }
}

export interface Team {
  id: string
  clubId: string
  name: string
  category: 'senior' | 'youth' | 'ladies' | 'other'
  color: string
  createdAt: Date
}

export interface Player {
  id: string
  clubId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  dateOfBirth?: Date
  jerseyNumber?: number
  position?: 'Tormann' | 'Abwehr' | 'Mittelfeld' | 'Sturm'
  teamIds: string[]
  status: 'active' | 'injured' | 'inactive'
  inviteToken?: string
  inviteTokenExpiry?: Date
  inviteTokenUsed: boolean
  accountStatus: 'invited' | 'active' | 'deactivated'
  uid?: string
  notificationPrefs: { push: boolean; email: boolean }
  fcmTokens: string[]
  createdAt: Date
  updatedAt: Date
}

export interface AdminUser {
  uid: string
  playerId: string
  role: 'admin' | 'trainer' | 'secretary'
  teamIds: string[]
  createdAt: Date
}

// Firestore timestamp helper – Firestore returns Timestamp objects, not native Dates
export type WithFirestoreTimestamps<T> = {
  [K in keyof T]: T[K] extends Date
    ? import('firebase/firestore').Timestamp
    : T[K] extends Date | undefined
    ? import('firebase/firestore').Timestamp | undefined
    : T[K]
}

export interface ClubEvent {
  id: string
  clubId: string
  title: string
  type: 'training' | 'match' | 'meeting' | 'other'
  startDate: Date
  endDate?: Date
  location?: string
  description?: string
  teamIds: string[]
  responseDeadline?: Date
  responseCount: {
    accepted: number
    declined: number
    total: number
  }
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface EventResponse {
  playerId: string
  status: 'accepted' | 'declined'
  reason?: string
  declineCategory?: 'injury' | 'work' | 'private' | 'other'
  respondedAt: Date
  source: 'pwa' | 'email'
}

// Added in Sprint 5
export interface PlayerMinutes {
  playerId: string
  minuteIn: number    // 0 = Startelf
  minuteOut: number   // 90 = durchgespielt
  isStarter: boolean
  goals: number
  assists: number
  yellowCards: number
  redCard: boolean
}

export interface MatchStat {
  id: string
  clubId: string
  eventId: string
  teamId: string
  opponent: string
  homeOrAway: 'home' | 'away'
  result: { goalsFor: number; goalsAgainst: number }
  playerMinutes: PlayerMinutes[]
  createdAt: Date
}

// Added status to ClubEvent (Sprint 5 fix – used for filtering cancelled events)
// Extend via declaration merging is not possible, so update interface here:
export type ClubEventStatus = 'scheduled' | 'cancelled' | 'completed'

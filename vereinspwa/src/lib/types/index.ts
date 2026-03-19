export interface Club {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor?: string
  createdAt: Date
  settings: {
    timezone: string
    defaultSport: string
    seasonStartMonth?: number
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
  photoUrl?: string
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

export type ClubEventStatus = 'scheduled' | 'cancelled' | 'completed'

export interface ClubEvent {
  id: string
  clubId: string
  title: string
  type: 'training' | 'match' | 'meeting' | 'other'
  status: ClubEventStatus
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
  /** Set when status changes to 'cancelled' */
  cancelReason?: string
  /** Flag set by hourly reminder function to avoid duplicate sends */
  reminders2hSent?: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export type DeclineCategory = 'injury' | 'work' | 'private' | 'other'

export interface EventResponse {
  playerId: string
  status: 'accepted' | 'declined'
  reason?: string
  declineCategory?: DeclineCategory
  respondedAt: Date
  source: 'pwa' | 'email'
}

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

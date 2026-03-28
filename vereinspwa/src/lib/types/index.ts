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
    /** Secret token for unauthenticated iCal feeds */
    icalToken?: string
  }
}

export interface Team {
  id: string
  clubId: string
  name: string
  category: 'senior' | 'youth' | 'ladies' | 'other'
  color: string
  /** Telegram group chat ID (set via /setup command in the group) */
  telegramGroupId?: number
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
  /** Telegram user ID (linked via phone number matching) */
  telegramUserId?: number
  telegramUsername?: string
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

// ─── Recurrence ───────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'weekly' | 'biweekly'

export interface RecurrenceRule {
  /** Frequency of recurrence */
  frequency: RecurrenceFrequency
  /** Days of week (0=Sunday … 6=Saturday). Multiple days allowed (e.g. Tue+Thu training). */
  daysOfWeek: number[]
  /** End date for the recurrence (inclusive). Max 6 months out. */
  until: Date
}

// ─── ClubEvent ────────────────────────────────────────────────────────────────

export interface ClubEvent {
  id: string
  clubId: string
  title: string
  /** 'event' = Vereins-Event (teamIds may be empty) */
  type: 'training' | 'match' | 'meeting' | 'event' | 'other'
  status: ClubEventStatus
  startDate: Date
  endDate?: Date
  location?: string
  description?: string
  /**
   * Empty array = Vereins-Event (betrifft alle Mannschaften).
   * Filled = team-specific event.
   */
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

  // ── Recurrence fields ──
  /**
   * If set, this event was generated from a recurring series.
   * Points to the ID of the first event in the series.
   */
  recurrenceGroupId?: string
  /**
   * The recurrence rule that was used to generate this series.
   * Only stored on the first event of the series (the "template").
   */
  recurrenceRule?: RecurrenceRule

  /** Telegram message references for live-updating event posts */
  telegramMessages?: Record<string, { messageId: number; chatId: number }>

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
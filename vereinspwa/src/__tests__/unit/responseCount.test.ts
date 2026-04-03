import { describe, it, expect } from 'vitest'

/**
 * Tests for the responseCount logic from /api/player/respond.
 * We test the counter update algorithm independently.
 */

type ResponseCountUpdate = {
  field: string
  value: number
}[]

function computeCounterUpdates(
  previousStatus: string | null,
  newStatus: 'accepted' | 'declined',
  currentCounts: Record<string, number>
): ResponseCountUpdate {
  if (!previousStatus) {
    // New response
    return [
      { field: `responseCount.${newStatus}`, value: 1 },
      { field: 'responseCount.total', value: 1 },
    ]
  }

  if (previousStatus !== newStatus) {
    const prevCount = currentCounts[previousStatus] ?? 0
    if (prevCount > 0) {
      // Normal swap
      return [
        { field: `responseCount.${previousStatus}`, value: -1 },
        { field: `responseCount.${newStatus}`, value: 1 },
      ]
    } else {
      // Corrupted counter — treat as new
      return [
        { field: `responseCount.${newStatus}`, value: 1 },
        { field: 'responseCount.total', value: 1 },
      ]
    }
  }

  // Same status re-submitted
  const currentStatusCount = currentCounts[newStatus] ?? 0
  if (currentStatusCount <= 0) {
    // Counter not tracked — fix it
    return [
      { field: `responseCount.${newStatus}`, value: 1 },
      { field: 'responseCount.total', value: 1 },
    ]
  }

  // Same status, counter correct — no change
  return []
}

describe('responseCount logic', () => {
  it('increments on new response (accepted)', () => {
    const updates = computeCounterUpdates(null, 'accepted', { accepted: 0, declined: 0, total: 0 })
    expect(updates).toEqual([
      { field: 'responseCount.accepted', value: 1 },
      { field: 'responseCount.total', value: 1 },
    ])
  })

  it('increments on new response (declined)', () => {
    const updates = computeCounterUpdates(null, 'declined', { accepted: 0, declined: 0, total: 0 })
    expect(updates).toEqual([
      { field: 'responseCount.declined', value: 1 },
      { field: 'responseCount.total', value: 1 },
    ])
  })

  it('swaps counters when changing from accepted to declined', () => {
    const updates = computeCounterUpdates('accepted', 'declined', { accepted: 3, declined: 1, total: 4 })
    expect(updates).toEqual([
      { field: 'responseCount.accepted', value: -1 },
      { field: 'responseCount.declined', value: 1 },
    ])
  })

  it('swaps counters when changing from declined to accepted', () => {
    const updates = computeCounterUpdates('declined', 'accepted', { accepted: 2, declined: 3, total: 5 })
    expect(updates).toEqual([
      { field: 'responseCount.declined', value: -1 },
      { field: 'responseCount.accepted', value: 1 },
    ])
  })

  it('treats corrupted counter (0) as new response on status change', () => {
    const updates = computeCounterUpdates('accepted', 'declined', { accepted: 0, declined: 0, total: 0 })
    expect(updates).toEqual([
      { field: 'responseCount.declined', value: 1 },
      { field: 'responseCount.total', value: 1 },
    ])
  })

  it('returns no updates when same status re-submitted and counter is correct', () => {
    const updates = computeCounterUpdates('accepted', 'accepted', { accepted: 3, declined: 1, total: 4 })
    expect(updates).toEqual([])
  })

  it('fixes counter when same status re-submitted but counter is zero', () => {
    const updates = computeCounterUpdates('accepted', 'accepted', { accepted: 0, declined: 0, total: 0 })
    expect(updates).toEqual([
      { field: 'responseCount.accepted', value: 1 },
      { field: 'responseCount.total', value: 1 },
    ])
  })
})

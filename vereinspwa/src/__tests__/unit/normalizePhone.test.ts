import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/telegram/phoneMatch'

describe('normalizePhone', () => {
  it('strips spaces and formats national number with country code', () => {
    expect(normalizePhone('0664 123 456')).toBe('43664123456')
  })

  it('handles international format with +', () => {
    expect(normalizePhone('+43 664 1234567')).toBe('436641234567')
  })

  it('handles international format without spaces', () => {
    expect(normalizePhone('+436641234567')).toBe('436641234567')
  })

  it('handles 00-prefix international format', () => {
    expect(normalizePhone('0043 664 123 456')).toBe('43664123456')
  })

  it('handles slashes in phone number', () => {
    expect(normalizePhone('0664/1234567')).toBe('436641234567')
  })

  it('handles dashes in phone number', () => {
    expect(normalizePhone('0664-123-4567')).toBe('436641234567')
  })

  it('handles German country code', () => {
    expect(normalizePhone('+49 171 1234567')).toBe('491711234567')
  })

  it('uses custom country code for national numbers', () => {
    expect(normalizePhone('0171 1234567', '49')).toBe('491711234567')
  })

  it('handles already clean number', () => {
    expect(normalizePhone('436641234567')).toBe('436641234567')
  })

  it('strips parentheses and other chars', () => {
    expect(normalizePhone('(0664) 123 456')).toBe('43664123456')
  })
})

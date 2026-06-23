import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
    expect(typeof body.timestamp).toBe('string')
  })

  it('returns a valid ISO timestamp', async () => {
    const response = await GET()
    const body = await response.json()

    // Should be a valid ISO 8601 date string
    const parsed = new Date(body.timestamp)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })

  it('returns a version string', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body.version).toBeDefined()
    expect(typeof body.version).toBe('string')
  })
})

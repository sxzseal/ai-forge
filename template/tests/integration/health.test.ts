import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns success envelope with status ok', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status_code).toBe(0)
    expect(body.data).toBeDefined()
    expect(body.data.status).toBe('ok')
  })

  it('returns a valid ISO timestamp', async () => {
    const response = await GET()
    const body = await response.json()

    expect(typeof body.data.timestamp).toBe('string')
    const parsed = new Date(body.data.timestamp)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })

  it('returns a version string', async () => {
    const response = await GET()
    const body = await response.json()

    expect(typeof body.data.version).toBe('string')
    expect(body.data.version.length).toBeGreaterThan(0)
  })
})

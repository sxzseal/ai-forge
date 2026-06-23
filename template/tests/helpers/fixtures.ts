/**
 * Shared test fixtures and factory functions.
 *
 * Use factories to generate consistent test data with optional overrides.
 * All tests should use these factories instead of inline objects, so data
 * shape changes only need to be made in one place.
 *
 * Usage:
 *   import { createUser } from '@/tests/helpers/fixtures'
 *   const user = createUser({ name: 'Alice' })
 */

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export function createUser(overrides?: Partial<User>): User {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}


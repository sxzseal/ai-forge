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


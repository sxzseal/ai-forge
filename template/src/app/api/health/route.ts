import { ok } from '@/lib/api-response'

export async function GET() {
  return ok({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  })
}

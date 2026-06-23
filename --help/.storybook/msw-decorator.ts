/**
 * MSW decorator for Storybook
 *
 * Note: With msw-storybook-addon, MSW is initialized in preview.ts
 * via initialize() and handlers are set per-story via parameters.msw.handlers.
 *
 * This file is kept as documentation for the MSW integration pattern.
 *
 * Usage in stories:
 * ```tsx
 * import { http, HttpResponse } from 'msw'
 *
 * export const Default: Story = {
 *   parameters: {
 *     msw: {
 *       handlers: [
 *         http.get('/api/users', () => {
 *           return HttpResponse.json({ data: [] })
 *         }),
 *       ],
 *     },
 *   },
 * }
 * ```
 */

// Re-export for convenience
export { http, HttpResponse, delay } from 'msw'

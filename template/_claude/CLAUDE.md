# __PROJECT_NAME__

> Built with ai-forge — AI-driven development framework

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.7+ (strict mode)
- **UI**: shadcn/ui + Tailwind CSS
- **Prototype**: Storybook 10 (`@storybook/nextjs-vite`) + MSW 2
- **Testing**: Vitest (unit/integration) + Playwright (e2e)
- **Deployment**: Vercel (frontend) + Railway (backend)

## Directory Conventions

```
src/
├── app/                       # Next.js App Router pages and API routes
├── components/ui/             # L1: shadcn/ui atoms (read-only, do not modify)
├── features/                  # L3: business feature modules
│   ├── _shared/               # L2: project-level shared primitives
│   │   ├── state/             #   Loading / Skeleton / Empty / Error
│   │   └── form/              #   FormField / formErrorText
│   └── <domain>/              # Feature module (queries, mutations, views, components)
└── lib/
    ├── utils.ts               # cn() helper
    ├── api-response.ts        # ApiResponse<T> envelope + ok() / err() helpers
    └── request.ts             # request<T>() — fetch wrapper consuming the envelope
```

## Component Layers

- **L1** (`components/ui/`): shadcn/ui atoms. Never modify directly.
- **L2** (`features/_shared/`): Project-wide shared primitives. Reuse, don't reimplement.
- **L3** (`features/<domain>/`): Business feature modules.

## API Contract (Single Source of Truth)

All endpoints written to `.loop/api-contracts.json` must validate against `api-contracts.schema.json` at the project root.

Response envelope (mandatory for all `/api/*` routes):

```ts
{ status_code: 0, data: T, message?: string }   // success
{ status_code: <non-0>, data: null, message: string }   // error
```

Helpers live in `src/lib/api-response.ts` (`ok()` / `err()`). The frontend `request<T>()` in `src/lib/request.ts` parses this envelope automatically.

## Commands

```bash
npm run dev           # Next.js dev server
npm run storybook     # Storybook + visual-feedback server on :6006 / :6007
npm run test          # Vitest unit + integration
npm run test:e2e      # Playwright e2e
npm run lint          # ESLint
npm run format        # Prettier
npm run typecheck     # TypeScript check
```

## Dev Loop

Default pipeline (3 phases): `proto → dev → deploy`. PRD, review, and test are optional add-on skills.

```bash
/dev-loop <requirement>        # Full pipeline (proto → dev → deploy)
/dev-loop ... --to proto       # Stop after prototype
/dev-loop --from dev           # Skip prototype (acceptance-checklist must exist)
/dev-loop --resume             # Resume from interruption
/dev-loop ... --skip-feedback  # Skip the visual-feedback annotation loop

# Optional add-ons (independent skills):
/dev-prd <requirement>         # Generate structured PRD
/dev-review                    # Deep code + security + PRD-compliance review
/dev-test                      # Generate full test suite + coverage report
```

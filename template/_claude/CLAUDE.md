# __PROJECT_NAME__

> Built with ai-forge — AI-driven development framework

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.7+ (strict mode)
- **UI**: shadcn/ui + Tailwind CSS
- **Prototype**: Storybook 8 + MSW 2
- **Testing**: Vitest (unit/integration) + Playwright (e2e)
- **Deployment**: Vercel (frontend) + Railway (backend)

## Directory Conventions

```
src/
├── app/              # Next.js App Router pages and API routes
├── components/ui/    # L1: shadcn/ui atoms (read-only, do not modify)
├── features/         # L3: business feature modules
│   ├── _shared/      # L2: project-level shared primitives
│   └── <domain>/     # Feature module (queries, mutations, views, components)
└── lib/              # Utility functions (cn, etc.)
```

## Component Layers

- **L1** (`components/ui/`): shadcn/ui atoms. Never modify directly.
- **L2** (`features/_shared/`): Project-wide shared components (tables, forms, page shells).
- **L3** (`features/<domain>/`): Business feature modules.

## Commands

```bash
npm run dev           # Next.js dev server
npm run storybook     # Storybook on :6006
npm run test          # Vitest unit + integration
npm run test:e2e      # Playwright e2e
npm run lint          # ESLint
npm run format        # Prettier
npm run typecheck     # TypeScript check
```

## Dev Loop

```bash
/dev-loop <requirement>        # Full pipeline
/dev-loop --from <phase>       # Start from specific phase
/dev-loop --resume             # Resume from interruption
```

## API Contract

API endpoints are defined in `.loop/api-contracts.json` (validated against `api-contracts.schema.json`). This single source of truth drives MSW handlers, API routes, and tests.

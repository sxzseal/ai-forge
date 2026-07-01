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
├── app/
│   ├── [locale]/              # ★ Locale-scoped pages (layout + page live here)
│   ├── api/                   # API routes (locale-agnostic)
│   └── globals.css            # Tailwind base + theme CSS variables
├── components/
│   ├── ui/                    # L1: shadcn/ui atoms (read-only, do not modify)
│   ├── theme-provider.tsx     # next-themes wrapper
│   ├── theme-toggle.tsx       # light/dark/system cycle button
│   └── locale-switcher.tsx    # zh-CN / en switcher
├── i18n/
│   ├── routing.ts             # locales + defaultLocale
│   ├── request.ts             # server-side message loader
│   └── navigation.ts          # Link / useRouter / redirect (locale-aware)
├── middleware.ts              # next-intl locale detection
├── features/                  # L3: business feature modules
│   ├── _shared/               # L2: project-level shared primitives
│   │   ├── state/             #   Loading / Skeleton / Empty / Error
│   │   └── form/              #   FormField / formErrorText
│   └── <domain>/              # Feature module (queries, mutations, views, components)
└── lib/
    ├── utils.ts               # cn() helper
    ├── api-response.ts        # ApiResponse<T> envelope + ok() / err() helpers
    └── request.ts             # request<T>() — fetch wrapper consuming the envelope
messages/
├── zh-CN.json                 # ★ Default locale
└── en.json                    # ★ Second locale — MUST stay in sync with zh-CN
```

## Theme & i18n (built-in)

- **Theme**: `next-themes` with `attribute="class"`, `defaultTheme="light"`, `enableSystem`. Tailwind uses semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, `border-input`, etc.) that swap via CSS variables in `globals.css`. **Never hardcode colors** (`bg-white`, `#fff`, `text-gray-*`).
- **i18n**: `next-intl` with `zh-CN` (default) and `en`. All user-facing text goes through `useTranslations()` / `getTranslations()`. **Never write bare strings** in JSX. Every new key must be added to **both** `messages/zh-CN.json` and `messages/en.json`.
- **Routing**: pages under `src/app/[locale]/`. First line of every page: `const { locale } = await params; setRequestLocale(locale)`. Use `@/i18n/navigation` (`Link`, `useRouter`, `redirect`) — never `next/link` or `next/navigation`.
- **Static generation**: page exports `generateStaticParams` that maps `routing.locales`.
- **Ready-made controls**: `<ThemeToggle />` and `<LocaleSwitcher />` in `@/components` — reuse, don't reinvent.

See `.claude/enhancers/proto/theme-and-i18n.md` and `.claude/enhancers/dev/theme-and-i18n.md` for the full rules the phase skills enforce.

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

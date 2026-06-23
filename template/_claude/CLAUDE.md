# __PROJECT_NAME__

> Built with ai-forge — AI-driven development framework

## Quick Start

```bash
# Install dependencies
npm install

# Install shadcn components
npx shadcn@latest init

# Start development
npm run dev

# Start Storybook
npm run storybook
```

## Dev Loop

This project uses ai-forge Dev Loop for AI-driven development:

```bash
/dev-loop <requirement>          # Full pipeline
/dev-loop <requirement> --to proto  # Up to prototype
/dev-loop --from review          # Start from review
/dev-loop --resume               # Resume last session
```

### Phases

| Phase | Skill | Description |
|-------|-------|-------------|
| 0 | clarify | Requirements clarification |
| 1 | dev-prd | Generate PRD document |
| 2 | dev-proto | Build Storybook prototype |
| 3 | dev-dev | Implement with parallel agents |
| 4 | dev-review | Code review + security scan |
| 5 | dev-test | Generate tests + human validation |
| 6 | dev-deploy | Deploy to Vercel + Railway |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Prototype**: Storybook 8 + MSW 2
- **Testing**: Vitest + Playwright
- **Deployment**: Vercel + Railway

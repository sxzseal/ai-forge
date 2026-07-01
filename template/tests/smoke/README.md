# Smoke tests

Post-deploy smoke suite consumed by `/dev-deploy` Step 4.5.

- Each test aligns with a P0 acceptance criterion (`AC-001 ~ AC-099` pages, `AC-101 ~ AC-199` API).
- Runs against `SMOKE_BASE_URL` env var (set by dev-deploy from the deployed URL).
- Fast, shallow checks only — this is not regression. Aim for < 30s total.
- Results are aggregated to `.loop/deploy/smoke-result.json`.

Run manually:

```bash
SMOKE_BASE_URL=https://your-app.vercel.app \
  npx playwright test --config=tests/smoke/playwright.smoke.config.ts
```

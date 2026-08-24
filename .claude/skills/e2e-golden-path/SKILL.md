---
name: e2e-golden-path
description: Write and run Playwright end-to-end tests for EduCRM's golden paths (login, dashboard load, core per-role flows). Use when adding a new page/flow that should have a regression test, or when asked to verify a UI change actually works in a real browser rather than just passing npm run build.
disable-model-invocation: true
---

# e2e-golden-path

`@playwright/test` is installed (`playwright.config.ts` at repo root,
`e2e/` for specs, `npm run test:e2e` to run). This didn't exist before —
the project's only automated frontend signal was `npm run build`, which
catches compile errors but nothing about actual runtime/visual behavior.
That gap is exactly how the grid-blowout and `flex-1` tabs bugs (PR #16,
#17) shipped twice: build stayed green both times.

## Why this exists, concretely

`npm run build` cannot catch:
- Horizontal overflow on a narrow viewport (the actual recurring bug class
  in this codebase — see `.claude/skills/design-system/SKILL.md`).
- A button that's visually present but not clickable (z-index issue,
  missing pointer-events).
- A form that submits but the success toast never fires.
- Anything that only breaks after a real navigation/auth flow.

Playwright MCP (`mcp__playwright__*`, already connected) is for *interactive,
ad-hoc* checking during a session — good for "does this look right right
now." This skill is for turning that into a *repeatable, checked-in*
regression test so the same bug can't silently come back later.

## Running

```bash
npm run dev              # in one terminal — dev server on :8080
npm run test:e2e         # in another — runs against localhost:8080
# or, against an already-running server:
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

`playwright.config.ts` runs every spec against two projects: `chromium`
(desktop) and `mobile` (Pixel 7 viewport, ~412px wide) — always both,
never just desktop, because desktop-only is exactly what let the mobile
blowout bugs through code review undetected.

## Writing a new golden-path spec

Follow `e2e/login-page.spec.ts` as the template. Two rules, non-negotiable
for this codebase specifically:

1. **Every new page-level spec includes a horizontal-overflow check**
   (`document.documentElement.scrollWidth <= clientWidth`), not just a
   "does it render" check. Copy the pattern from `login-page.spec.ts`.
2. **Don't hardcode a specific test tenant/account's data as an assertion**
   unless the spec is explicitly about that flow (e.g. "director login
   succeeds"). Local dev DB state drifts between sessions/machines — prefer
   asserting on structure (fields present, no overflow, toast appears)
   over asserting on specific seeded values, so specs don't rot into false
   failures when someone's local data differs.

For a flow that needs authentication, don't re-type credentials in every
spec — use Playwright's `storageState` to log in once in a
`globalSetup`/fixture and reuse the session, otherwise the login flow
becomes a single point of flakiness for every other spec.

## What NOT to do

- Don't add this to the GitHub Actions `frontend` job yet — it needs a
  running dev server (and, for anything beyond the login page, seeded
  tenant data), neither of which CI currently provisions. Wiring that up
  is a separate, bigger task (test DB fixture + CI service step) — flag it
  to the user rather than silently expanding CI scope.
- Don't write specs that depend on production or the shared local dev DB
  having specific rows — see rule 2 above.

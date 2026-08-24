---
name: design-system
description: EduCRM's own design system — the 8 UI pillars, concrete component conventions, and the specific CSS pitfalls that have shipped broken to production twice. Use for any frontend work touching src/routes/ or src/components/ — new pages, new components, or editing existing layout/styling.
---

# design-system

`CLAUDE.md` has referenced this skill by name ("Активные скилы: `frontend-design`,
`design-system`, `shadcn`") since early in the project, but until now it didn't
exist as a file — only the generic Anthropic `frontend-design` plugin was
actually wired up. This skill is EduCRM's own concrete design system: not
generic shadcn advice (the `frontend-design` skill/plugin already covers
that), but the specific conventions, canonical components, and known failure
modes of *this* codebase.

Stack: TanStack Start + Tailwind v4 + shadcn/ui (`new-york` preset, Radix
primitives, `lucide-react` icons). Always use semantic tokens (`bg-primary`,
`text-muted-foreground`), `gap-*` instead of `space-y-*`, `size-*` instead of
`w-* h-*`.

## The 8 pillars (from CLAUDE.md — the acceptance bar for any UI work)

1. **Micro-animations.** Every action gets a 150–300ms response: cards
   fade in, panels slide out, buttons "press down" on click. Use shadcn
   Dialog/Sheet's built-in animations as-is. Respect
   `prefers-reduced-motion`.
2. **Typographic hierarchy.** Primary / secondary / hint must be visually
   obvious at a glance — vary size and weight (light/regular/semibold/bold)
   and line-height. Never render everything at one size.
3. **Every element has states.** Minimum 5: default, hover, active,
   disabled, loading. The user must always be able to tell what's
   clickable and what's happening.
4. **Empty states.** An empty list is the `Empty` component: icon + clear
   text ("У вас пока нет студентов") + an action button. Never a blank
   white screen.
5. **Feedback on every action.** Click → spinner/"Saving…" → `sonner`
   toast: green "Saved" or red with the specific reason. Route errors
   through `apiErrorMessage` for real detail, never a bare "Xatolik".
6. **Details for the attentive eye.** Avatar initials colored
   deterministically by name, icons aligned with text (`data-icon`),
   alternating table row shading, a thin colored accent bar on the active
   menu item.
7. **Meaningful color, not decorative.** Red = danger/delete only, green =
   success/active, yellow = warning, gray = inactive. Color carries
   information. No `bg-blue-500` "because blue looks nice."
8. **Responsive to context.** Not a squeezed desktop layout: tables become
   cards on mobile, sidebar becomes bottom nav, touch targets ≥44px,
   modals open from the bottom as `Drawer`/`Sheet`. `student/` and
   `parent/` portals are mobile-first (`MobileLayout`).

## Canonical components — reuse these, don't reinvent

| Need | Use | Not |
|---|---|---|
| Page wrapper | `src/components/edu/page-shell.tsx` (`PageShell`) | ad-hoc `<div>` + manual title markup |
| Numeric input (coins, amounts) | `src/components/edu/number-input.tsx` (`NumberInput`) | native `<input type="number">` — its arrow/scroll/minus behavior is non-standard and was the subject of an explicit user complaint |
| Destructive/irreversible confirmation | `src/components/ui/confirm-dialog.tsx` (`ConfirmDialog`) | `window.confirm` — never, no exceptions |
| Coin award/deduct UI shared across roles | `src/components/edu/coin-students-tab.tsx` (`CoinStudentsTab`) | copy-pasting the table per portal |
| Notifications | `sonner` toast, capped `max-w-[calc(100vw-2rem)]` on the popover | custom alert boxes |

## The two bugs that shipped to production — check for both, every time

These aren't hypothetical — both shipped, both were only caught by the user
sending screenshots of a broken production UI, and both are still exactly as
easy to reintroduce as they were the first time. `mobile-layout-reviewer`
(`.claude/agents/mobile-layout-reviewer.md`) automates this check, and the
`mobile_grid_check.py` PostToolUse hook re-checks it live on every `.tsx`
edit — but know the rule yourself, don't rely on the hook alone.

### 1. Grid blowout
`className="grid md:grid-cols-3 ..."` with no base `grid-cols-1` leaves the
single mobile column sized to `auto` (max-content). `PageShell` sets
`overflow-x: hidden`, so the oversized column doesn't scroll — it gets
silently **clipped**. Shipped in 44 files (PR #17). Always write the base
class first: `className="grid grid-cols-1 md:grid-cols-3 ..."`.

### 2. `flex-1` on tabs
`flex-1` on a Radix `TabsTrigger` forces equal-width rigid columns; combined
with `TabsTrigger`'s default `whitespace-nowrap`, 4+ tabs or longer uz/ru
labels overflow the same way. Fix: wrap `TabsList` in a horizontal-scroll
container (see `src/components/students/student-detail-sheet.tsx`,
`src/routes/admin/groups.tsx`) instead of using `flex-1` to force-fit.

## Known tech debt — don't silently "fix" without a deliberate pass

`--success`/`--warning`/`--info`/`--danger` tokens in `src/styles.css` are
only defined in `:root`, with **no `.dark` override** — every badge/status
color renders the same bright light-mode hex in dark theme. This was found
and deliberately deferred (blast radius is every role's screens, not one
page) — see memory `educrm-semantic-tokens-dark-mode-debt`. If asked to fix
dark-mode badge colors, add a `.dark` override block using the same muted
approach already validated for the KPI icon tones (`tone-blue`/`tone-amber`/
`tone-violet`/`tone-cyan` in `styles.css`) — don't just flatten to one color.

## Before calling frontend work done

- New/changed `.tsx` under `src/` → mentally check both blowout patterns
  above (the hook will also catch grid blowout automatically).
- `npm run build` — this project has no `tsc --noEmit` CI gate (44
  pre-existing type errors block it), so build is the only automated signal;
  don't introduce a 45th type error into whatever file you're touching.
- If the change is visual and Playwright MCP is available, actually look at
  it at a narrow width (375px) before calling it done — static code review
  has missed this bug class twice already in this project's history.

---
name: release-notes
description: Summarize merged PRs since a given point (last release note, a date, or a tag) into client-facing release notes in Russian/Uzbek and an internal changelog entry for CLAUDE.md. Use when the user asks "что нового", "собери итоги", "что мы сделали за неделю", or after shipping several PRs in one session.
disable-model-invocation: true
---

# release-notes

This project's `CLAUDE.md` has a "ТЕКУЩИЙ СТАТУС И ОТКРЫТЫЕ ЗАДАЧИ" section
that's been hand-written after every PR batch throughout this engagement
(PR #9-#19) — always the same shape: what shipped, why it mattered, what's
still open. This skill turns that recurring manual write-up into a repeatable
process, and additionally produces a client-facing version (the actual
audience for "what's new" is a non-technical school director, not another
engineer).

## Process

1. **Gather the range.** Default to everything merged since the last entry
   in `CLAUDE.md`'s "Последние коммиты" section, unless the user gives an
   explicit date/tag/PR range.

   ```bash
   git log --merges --oneline origin/master --since="<date>"
   gh pr list --state merged --limit 20 --json number,title,mergedAt,body
   ```

2. **Classify each merged PR** by type (feature / fix / security / chore) —
   the commit prefix (`feat`, `fix`, `chore`, `docs`) usually already says
   this; confirm against the PR body if ambiguous.

3. **Produce two outputs, not one:**

   - **Internal (`CLAUDE.md` update)**: same shape as every prior entry —
     what shipped, one line on *why* (not just what changed), and anything
     still requiring owner action. Follow the exact structure of the
     existing "Влито и проверено на проде" / "Требует действий владельца" /
     "Известные проблемы, не тронутые" sections — don't invent a new
     format.
   - **Client-facing (separate message or doc, NOT CLAUDE.md)**: plain-
     language summary for a school director/admin, in Russian (or Uzbek if
     that's who's asking) — no file paths, no PR numbers, no framework
     names. "Списания за отменённые занятия теперь возвращаются
     автоматически" — not "fixed excused-attendance refund signal in
     lessons/signals.py". Group by what the user-facing feature/fix
     actually does for them, not by technical area.

4. **Never fabricate what wasn't verified.** If a PR's test plan checkbox
   was left unchecked ("требует ручной проверки"), say so in the internal
   note — don't upgrade it to "проверено" just because it merged. This
   matches the standing project rule: only claim something works on the
   actual production Railway deployment, not on CI passing alone (CI runs
   under SQLite with `apps.tenants` stripped from `INSTALLED_APPS` — see
   `.claude/skills/verify-prod-migrations/SKILL.md` — a green pipeline is
   necessary, not sufficient).

## Output discipline

- Client-facing notes: no jargon, no internal architecture, no blame for
  what was broken before — just what's better now.
- Internal `CLAUDE.md` update: follow existing section headers exactly,
  don't restructure the file's format even if you think it could be
  cleaner — this file is read at the start of every future session, so
  contents matter far more than an editorial reshuffle would.
- If nothing shipped since the last entry, say that plainly rather than
  padding the notes with chores.

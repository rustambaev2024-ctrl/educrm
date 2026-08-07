#!/usr/bin/env python
"""PreToolUse hook: block `python manage.py migrate` run against prod via
`railway ssh`/`railway run`, even though it's not literally the same string
as the already-denied `Bash(python manage.py migrate:*)` permission rule.

That deny rule matches commands *starting with* `python manage.py migrate`
— a command like `railway ssh --service educrm -- python manage.py migrate`
starts with `railway ssh`, not `python manage.py migrate`, so it slips past
the existing permission deny entirely. This hook closes that specific gap.

Prod Postgres has no backups (PITR is off — see memory
educrm-railway-backups-missing), so an accidental/unreviewed migrate on the
live database is not casually reversible. `showmigrations` (read-only) and
local/dev migrate are intentionally NOT blocked here — only a real migrate
verb reaching a Railway-attached shell.
"""
import json
import re
import sys

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

RAILWAY_REMOTE_RE = re.compile(r"\brailway\s+(ssh|run)\b")
MIGRATE_VERB_RE = re.compile(r"\bmanage\.py\s+migrate(_schemas)?\b")
SHOWMIGRATIONS_RE = re.compile(r"\bshowmigrations\b")


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""

    if not RAILWAY_REMOTE_RE.search(command):
        return 0
    if not MIGRATE_VERB_RE.search(command):
        return 0
    if SHOWMIGRATIONS_RE.search(command):
        return 0

    sys.stderr.write(
        "Заблокировано: команда похожа на `migrate` на прод-БД через railway "
        "ssh/run:\n"
        f"  {command}\n\n"
        "Прод-Postgres не имеет бэкапов (PITR выключен — см. память "
        "educrm-railway-backups-missing), это не отменяемо одной командой. "
        "Прежде чем продолжать:\n"
        "  1. Показать пользователю, какая именно миграция не применена и "
        "что она делает (cat backend/apps/<app>/migrations/000N_*.py).\n"
        "  2. Получить явное подтверждение пользователя на именно эту "
        "миграцию, не разрешение вообще на 'работу с прод'.\n"
        "  3. Только после этого запускать — и снова с явным railway "
        "ssh/run, здесь автоматически ничего не разрешится.\n"
        "См. .claude/skills/verify-prod-migrations/SKILL.md.\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())

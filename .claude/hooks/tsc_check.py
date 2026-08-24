#!/usr/bin/env python
"""PostToolUse hook: catch NEW TypeScript errors in an edited .tsx/.ts file.

`npm run build` is this project's only frontend gate — there's no `tsc
--noEmit` in CI because 11 files carry 24 pre-existing type errors (see
CLAUDE.md "Известные проблемы"); a hard gate on the whole project would be
permanently red. This hook doesn't try to fix that — it compares the
edited file's current error count against tsc-baseline.json (the known,
already-accepted count) and only speaks up if the count went UP, i.e. this
edit added error #25 rather than living with one of the existing 24.

Uses `tsc --incremental` with a cached .tsbuildinfo so repeat runs during a
session are ~3s instead of ~19s — the incremental cache is gitignored
(machine-local), tsc-baseline.json is not (it's the project's accepted
baseline, shared).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

REPO_MARKER = "/src/"
ERROR_LINE_RE = re.compile(r"^([^(]+)\(")


def find_repo_root(norm_path):
    idx = norm_path.find(REPO_MARKER)
    return None if idx == -1 else norm_path[:idx]


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    file_path = (payload.get("tool_input") or {}).get("file_path") or ""
    norm = file_path.replace("\\", "/")
    if not (norm.endswith(".tsx") or norm.endswith(".ts")) or REPO_MARKER not in norm:
        return 0

    repo_root = find_repo_root(norm)
    if repo_root is None:
        return 0

    baseline_path = Path(repo_root) / ".claude" / "hooks" / "tsc-baseline.json"
    if not baseline_path.exists():
        return 0
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))

    rel_path = norm[len(repo_root) + 1 :]

    result = subprocess.run(
        [
            "npx",
            "tsc",
            "--noEmit",
            "--incremental",
            "--tsBuildInfoFile",
            ".claude/hooks/.tsc-cache.tsbuildinfo",
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        shell=True,
    )

    current_errors = [
        line for line in result.stdout.splitlines() if line.startswith(rel_path + "(")
    ]
    current_count = len(current_errors)
    baseline_count = baseline.get(rel_path, 0)

    if current_count > baseline_count:
        errors_text = "\n".join(f"  {line}" for line in current_errors)
        sys.stderr.write(
            f"Новые ошибки типов в {rel_path}: было {baseline_count} (принято как "
            f"известный техдолг), стало {current_count}.\n{errors_text}\n"
            "Это не полный tsc-гейт (в проекте есть 24 старых ошибки в 11 файлах, "
            "CI их не проверяет) — но именно ЭТА правка добавила новую. Поправь её "
            "или, если ошибка была там до правки (редко, но возможно при сдвиге "
            "строк), обнови .claude/hooks/tsc-baseline.json сознательно, не молча.\n"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

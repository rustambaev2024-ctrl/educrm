#!/usr/bin/env python
"""PostToolUse hook: catch the recurring "grid/flex blowout on mobile" bug.

This exact bug class shipped three times in this codebase before it was
found (PR #16, #17) — a `className` with a breakpoint-prefixed
`md:grid-cols-N`/`lg:grid-cols-N` but no base `grid-cols-1` leaves a single
mobile column sized to max-content, which silently overflows because
PageShell sets `overflow-x: hidden` instead of showing a scrollbar. This
hook re-checks that specific, previously-shipped-broken pattern on every
edit to a .tsx file under src/, and blocks (exit 2, fed back to Claude) on
a clear-cut hit. It also does a softer, non-blocking check for `flex-1` on
Tabs components (the second bug class from the same PRs), printed as a
heads-up rather than a hard block since that pattern has more false
positives (flex-1 is often fine outside TabsTrigger).

Reads the standard Claude Code PostToolUse hook JSON payload from stdin.
"""
import json
import re
import sys

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CLASSNAME_RE = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([^)]*)\)\})')
BREAKPOINT_GRID_RE = re.compile(r"(?<![-:\w])(sm|md|lg|xl|2xl):grid-cols-\d+")
BASE_GRID_RE = re.compile(r"(?<![-:\w])grid-cols-\d+")


def find_grid_blowouts(text):
    hits = []
    for match in CLASSNAME_RE.finditer(text):
        classes = match.group(1) or match.group(2) or match.group(3) or ""
        if BREAKPOINT_GRID_RE.search(classes) and not BASE_GRID_RE.search(classes):
            line_no = text.count("\n", 0, match.start()) + 1
            hits.append((line_no, classes.strip()))
    return hits


def find_flex1_tabs_warning(text):
    if "TabsTrigger" not in text:
        return False
    for match in CLASSNAME_RE.finditer(text):
        classes = match.group(1) or match.group(2) or match.group(3) or ""
        if "flex-1" in classes:
            return True
    return False


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    file_path = (payload.get("tool_input") or {}).get("file_path") or ""
    norm = file_path.replace("\\", "/")
    if "/src/" not in norm or not norm.endswith(".tsx"):
        return 0

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return 0

    blowouts = find_grid_blowouts(text)
    if blowouts:
        lines = "\n".join(f"  строка {ln}: className=\"{cls}\"" for ln, cls in blowouts)
        sys.stderr.write(
            "Найден известный баг-паттерн «grid blowout на мобильных» "
            f"(см. PR #17) в {norm}:\n{lines}\n"
            "Брейкпоинт-classes grid-cols-N без базового grid-cols-1 растягивают "
            "мобильную колонку до max-content, а PageShell (overflow-x: hidden) "
            "молча режет контент вместо скролла. Добавь базовый grid-cols-1 "
            "перед md:/lg:/xl: вариантами.\n"
        )
        return 2

    if find_flex1_tabs_warning(text):
        print(
            f"Внимание: {norm} использует flex-1 рядом с TabsTrigger — "
            "это был второй источник переполнения табов на мобильных (PR #16, #17). "
            "Если табов больше 2-3 или подписи длинные — проверь на узком экране "
            "или оберни TabsList в горизонтальный скролл вместо flex-1."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

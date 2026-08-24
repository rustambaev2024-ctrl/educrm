#!/usr/bin/env python
"""PostToolUse hook: lint a just-edited backend .py file with flake8.

Reads the standard Claude Code hook JSON payload from stdin, and if the
edited file lives under backend/apps/ (excluding migrations, which are
generated code we don't hand-style), runs flake8 on it using the repo's
.flake8 config. Exit code 2 feeds stderr back to Claude as a correction
signal (PostToolUse hook convention); any other outcome is silent.
"""
import json
import subprocess
import sys

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    file_path = (payload.get("tool_input") or {}).get("file_path") or ""
    norm = file_path.replace("\\", "/")

    marker = "/backend/apps/"
    idx = norm.find(marker)
    if idx == -1 or not norm.endswith(".py") or "/migrations/" in norm:
        return 0

    backend_dir = norm[: idx + len("/backend")]
    rel_path = norm[idx + len("/backend/") :]

    result = subprocess.run(
        ["python", "-m", "flake8", rel_path],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(f"flake8 нашёл проблемы в {rel_path}:\n{result.stdout}{result.stderr}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Храповик стандартов EduCRM.

Проблема: абсолютные правила («никаких any») на живом коде дают сотни
нарушений. Правило, нарушенное 145 раз, агенты перестают читать —
и это первый шаг к деградации всей команды.

Решение: фиксируем текущий уровень (baseline) и запрещаем его РОСТ.
Стало меньше — baseline автоматически опускается и больше не поднимется.
Так долг только уменьшается, а правило остаётся выполнимым.

  baseline.py snapshot   — записать текущие значения (делается один раз)
  baseline.py check      — сравнить с baseline; выход 1 при регрессе
  baseline.py report     — человекочитаемая сводка

Сканирование — на чистом Python, без bash и grep: скрипт обязан одинаково
работать и на Windows у разработчика, и на Ubuntu в GitHub Actions.
"""
import json
import os
import re
import sys

# --- Windows: принудительно UTF-8 на вывод ---
# Консоль Windows по умолчанию cp866, из-за чего русский текст превращается
# в кракозябры. Claude Code читает вывод как UTF-8, поэтому выравниваем.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "vault", "40-Standards", "baseline.json")

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__", ".venv", "venv",
    "env", ".next", "coverage", "staticfiles", "media", ".pytest_cache",
    ".mypy_cache", ".ruff_cache",
}

# Брендовые цвета разрешены явно: они закреплены в DESIGN_SYSTEM.md проекта
# как `bg-[#0077b6]`. Запрещены только цвета ВНЕ палитры.
BRAND = re.compile(r"0077b6|00b4d8|1a2332|f8fafc", re.I)

TS = {".ts", ".tsx"}
PY = {".py"}


def walk(rel_dir, exts):
    """Все файлы с нужными расширениями, кроме служебных папок."""
    base = os.path.join(ROOT, rel_dir)
    if not os.path.isdir(base):
        return
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if os.path.splitext(fn)[1] in exts:
                yield os.path.join(dirpath, fn)


def _lines(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            return f.readlines()
    except OSError:
        return []


def scan(rel_dir, exts, pattern, exclude_line=None, exclude_path=None):
    """Считает СТРОКИ, содержащие совпадение."""
    rx = re.compile(pattern)
    ex_line = re.compile(exclude_line) if exclude_line else None
    ex_path = re.compile(exclude_path, re.I) if exclude_path else None
    total = 0
    for path in walk(rel_dir, exts):
        if ex_path and ex_path.search(path.replace("\\", "/")):
            continue
        for line in _lines(path):
            if not rx.search(line):
                continue
            if ex_line and ex_line.search(line):
                continue
            total += 1
    return total


def _hex_nonbrand():
    """Считает ВХОЖДЕНИЯ небрендовых hex-цветов."""
    total = 0
    for path in walk("src", TS):
        for line in _lines(path):
            for m in re.findall(r"#[0-9a-fA-F]{6}", line):
                if not BRAND.search(m):
                    total += 1
    return total


def _runpython_no_reverse():
    """RunPython, у которого рядом нет reverse_code."""
    total = 0
    for path in walk("backend", PY):
        src = "".join(_lines(path))
        for m in re.finditer(r"RunPython\s*\(", src):
            tail = src[m.end():m.end() + 400]
            if "reverse_code" not in tail and "noop" not in tail:
                total += 1
    return total


METRICS = {
    "fe_hex_nonbrand": {
        "label": "Небрендовые hex-цвета во фронте",
        "std": "frontend-standards п.1 / design-system",
        "fn": _hex_nonbrand,
    },
    "fe_window_confirm": {
        "label": "window.confirm вместо ConfirmDialog",
        "std": "design-system / frontend-standards п.2",
        "fn": lambda: scan("src", TS, r"window\.confirm"),
    },
    "fe_any": {
        "label": "any в TypeScript",
        "std": "frontend-standards п.4",
        "fn": lambda: scan("src", TS, r":\s*any\b|\bas any\b"),
    },
    "fe_foreign_icons": {
        "label": "Иконки не из lucide-react",
        "std": "design-system",
        "fn": lambda: scan("src", TS,
                           r"""from\s+['"](?:react-icons|@heroicons|@mui/icons)"""),
    },
    "be_print": {
        "label": "print() вместо логгера",
        "std": "backend-standards",
        "fn": lambda: scan("backend/apps", PY, r"(?<![\w.])print\s*\(",
                           exclude_path=r"(test|conftest|migrations)"),
    },
    "be_role_inline": {
        "label": "Проверка роли вне permission-класса",
        "std": "backend-standards / security-standards",
        "fn": lambda: scan("backend/apps", PY, r"\.role\s*(?:==|!=|\bin\b)",
                           exclude_path=r"(test|conftest|migrations)"),
    },
    "be_runpython_noreverse": {
        "label": "RunPython без reverse_code",
        "std": "db-standards п.3",
        "fn": _runpython_no_reverse,
    },
    "be_secrets": {
        "label": "Возможные секреты в коде",
        "std": "security-standards",
        "fn": lambda: scan(
            "backend", PY,
            r"(?:SECRET|PASSWORD|TOKEN|API_KEY)\w*\s*=\s*['\"][^'\"]{8,}['\"]",
            exclude_line=r"(os\.environ|os\.getenv|config\(|env\(|getenv)",
            exclude_path=r"(test|conftest)",
        ),
    },
}

# Метрики с нулевой терпимостью: baseline игнорируется, любое появление = ошибка
ZERO_TOLERANCE = {"be_secrets", "fe_foreign_icons"}


def measure():
    return {k: v["fn"]() for k, v in METRICS.items()}


def _save(metrics):
    json.dump(
        {"note": "Храповик: значения могут только уменьшаться. "
                 "Обновляется автоматически при улучшении.",
         "metrics": metrics},
        open(BASE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def cmd_snapshot():
    cur = measure()
    _save(cur)
    print("Baseline записан:")
    for k, v in cur.items():
        print(f"  {METRICS[k]['label']}: {v}")
    return 0


def cmd_check():
    if not os.path.exists(BASE):
        print("Baseline отсутствует. Запусти: python scripts/baseline.py snapshot")
        return 1
    b = json.load(open(BASE, encoding="utf-8"))["metrics"]
    cur = measure()

    # Защита от поломанного сканера: если ВСЁ разом обнулилось, а раньше было
    # ненулевым — это почти наверняка сбой измерения, а не чудо-рефакторинг.
    if sum(cur.values()) == 0 and sum(b.values()) > 0:
        print("  ОТКАЗ: все метрики разом обнулились.")
        print("  Это похоже на сбой сканера, а не на реальное улучшение.")
        print("  Baseline НЕ изменён. Проверь скрипт, прежде чем доверять цифрам.")
        return 1

    bad, good, changed = [], [], False
    for k, v in cur.items():
        old = b.get(k, 0)
        if k in ZERO_TOLERANCE:
            if v > 0:
                bad.append((k, old, v, "нулевая терпимость"))
            continue
        if v > old:
            bad.append((k, old, v, f"рост на {v - old}"))
        elif v < old:
            good.append((k, old, v))
            b[k] = v
            changed = True
    if changed:
        _save(b)
    for k, old, new in good:
        print(f"  УЛУЧШЕНИЕ  {METRICS[k]['label']}: {old} → {new} (baseline опущен)")
    for k, old, new, why in bad:
        print(f"  РЕГРЕСС    {METRICS[k]['label']}: {old} → {new} ({why})")
        print(f"             стандарт: {METRICS[k]['std']}")
    if not bad and not good:
        print("  Без изменений — регресса нет.")
    return 1 if bad else 0


def cmd_report():
    cur = measure()
    b = json.load(open(BASE, encoding="utf-8"))["metrics"] if os.path.exists(BASE) else {}
    print(f"{'Метрика':<42}{'baseline':>10}{'сейчас':>9}  статус")
    print("-" * 75)
    for k, v in cur.items():
        old = b.get(k, "—")
        if k in ZERO_TOLERANCE:
            st = "OK" if v == 0 else "НАРУШЕНИЕ (нулевая терпимость)"
        elif old == "—":
            st = "нет baseline"
        elif v > old:
            st = f"РЕГРЕСС +{v - old}"
        elif v < old:
            st = f"улучшение −{old - v}"
        else:
            st = "стабильно"
        print(f"{METRICS[k]['label']:<42}{str(old):>10}{v:>9}  {st}")
    return 0


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else "report"
    sys.exit({"snapshot": cmd_snapshot, "check": cmd_check, "report": cmd_report}
             .get(c, cmd_report)())

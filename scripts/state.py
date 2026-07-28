#!/usr/bin/env python3
"""
EduCRM — движок состояния и хендоффов.

Единственный допустимый способ менять vault/60-State/state.json.
Агенты НЕ редактируют JSON руками — только через этот CLI.
Это защита от дрейфа: state machine валидирует переходы, а не модель.

Использование:
  state.py show                              — всё состояние кратко
  state.py mine <role>                       — задачи, где я владелец и не заблокирован
  state.py feature-add <id> "<title>" [--modules m-leads,m-finance] [--roles teacher,student]
  state.py task-add <id> "<title>" --feature <fid> --owner <role> [--status backlog] [--after t1,t2]
  state.py advance <task-id> [--to <status>] [--note "..."]
  state.py block <task-id> --reason "..."
  state.py unblock <task-id>
  state.py staging <task-id> --commit <sha>   — фиксирует пуш в staging и открывает QA
  state.py verdict <task-id> --pass|--fail [--note "..."]
  state.py board                              — перерисовать vault/60-State/board.md
  state.py check                              — валидация состояния (для Наzorat/CI)
"""
import json, sys, os, argparse, datetime

# --- Windows: принудительно UTF-8 на вывод ---
# Консоль Windows по умолчанию cp866, из-за чего русский текст превращается
# в кракозябры. Claude Code читает вывод как UTF-8, поэтому выравниваем.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "vault", "60-State", "state.json")
BOARD = os.path.join(ROOT, "vault", "60-State", "board.md")
HANDOFFS = os.path.join(ROOT, "vault", "60-State", "handoffs")

# Разрешённые переходы. Ключ -> список допустимых следующих статусов.
FLOW = {
    "backlog":       ["design", "dev"],
    "design":        ["design_review"],
    "design_review": ["design", "dev", "done"],
    "dev":           ["code_review"],
    "code_review":   ["dev", "staging"],
    "staging":       ["qa"],
    "qa":            ["fix", "release_ready"],
    "fix":           ["dev"],
    "release_ready": ["prod"],
    "prod":          ["done"],
    "done":          [],
}
# Кто владеет каждым статусом по умолчанию.
# Статусы с фиксированным владельцем. None = вернуть владельца к assignee задачи.
STATUS_OWNER = {
    "backlog": "tech-lead", "design": None, "design_review": "tech-lead",
    "dev": None, "code_review": "tech-lead", "staging": "devops", "qa": "qa",
    "fix": None, "release_ready": "tech-lead", "prod": "devops", "done": None,
}

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def load():
    with open(STATE, encoding="utf-8") as f:
        return json.load(f)

def save(s):
    s["updated_at"] = now()
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=2)
    write_board(s)

def find(s, tid):
    for t in s["tasks"]:
        if t["id"] == tid:
            return t
    sys.exit(f"ОШИБКА: задача {tid} не найдена")

def logit(s, tid, frm, to, note=""):
    s["log"].append({"at": now(), "task": tid, "from": frm, "to": to, "note": note})
    os.makedirs(HANDOFFS, exist_ok=True)
    t = find(s, tid)
    path = os.path.join(HANDOFFS, f"{tid}.md")
    head = "" if os.path.exists(path) else f"# Хендоффы задачи {tid} — {t['title']}\n\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"{head}- `{now()}` **{frm} → {to}** · владелец: `{t.get('owner')}`"
                + (f" · {note}" if note else "") + "\n")

def blockers(s, t):
    """Незакрытые зависимости."""
    out = []
    for dep in t.get("after", []):
        d = next((x for x in s["tasks"] if x["id"] == dep), None)
        if d and d["status"] not in ("done", "prod"):
            out.append(f"{dep} ({d['status']})")
    return out

# ---------- команды ----------

def cmd_show(s, a):
    print(f"EduCRM · обновлено {s['updated_at']}")
    print(f"Ветки: prod={s['branches']['production']} staging={s['branches']['staging']}\n")
    if not s["tasks"]:
        print("Задач нет.")
        return
    for f in s["features"]:
        print(f"■ ФИЧА {f['id']}: {f['title']}  [модули: {', '.join(f.get('modules') or ['-'])}]")
        for t in [x for x in s["tasks"] if x.get("feature") == f["id"]]:
            b = blockers(s, t)
            mark = "⛔" if (t.get("blocked") or b) else "  "
            extra = f"  ждёт: {', '.join(b)}" if b else ""
            if t.get("blocked"):
                extra += f"  БЛОК: {t['blocked']}"
            sc = f"  @{t['staging_commit'][:8]}" if t.get("staging_commit") else ""
            print(f"  {mark} {t['id']:<10} {t['status']:<14} → {t.get('owner','-'):<10} {t['title']}{sc}{extra}")
        print()
    orphan = [x for x in s["tasks"] if not x.get("feature")]
    if orphan:
        print("■ БЕЗ ФИЧИ")
        for t in orphan:
            print(f"    {t['id']:<10} {t['status']:<14} → {t.get('owner','-'):<10} {t['title']}")

def cmd_mine(s, a):
    role = a.role
    ready, blocked = [], []
    for t in s["tasks"]:
        if t.get("owner") != role or t["status"] in ("done", "prod"):
            continue
        b = blockers(s, t)
        if t.get("blocked") or b:
            blocked.append((t, b))
        else:
            ready.append(t)
    print(f"=== {role}: можно работать ({len(ready)}) ===")
    for t in ready:
        sc = f" staging_commit={t['staging_commit']}" if t.get("staging_commit") else ""
        print(f"  {t['id']} [{t['status']}] {t['title']}{sc}")
        if t.get("feature"):
            print(f"      спека: vault/60-State/features/{t['feature']}.md")
    if not ready:
        print("  (ничего — не выдумывай себе работу, сообщи что свободен)")
    print(f"\n=== {role}: заблокировано ({len(blocked)}) ===")
    for t, b in blocked:
        why = t.get("blocked") or f"ждёт {', '.join(b)}"
        print(f"  {t['id']} [{t['status']}] {t['title']} — {why}")

def cmd_feature_add(s, a):
    if any(f["id"] == a.id for f in s["features"]):
        sys.exit(f"ОШИБКА: фича {a.id} уже есть")
    s["features"].append({
        "id": a.id, "title": a.title, "created_at": now(),
        "modules": a.modules.split(",") if a.modules else [],
        "roles": a.roles.split(",") if a.roles else [],
        "spec": f"vault/60-State/features/{a.id}.md",
    })
    save(s)
    print(f"OK: фича {a.id} создана. Спека: vault/60-State/features/{a.id}.md")

def cmd_task_add(s, a):
    if any(t["id"] == a.id for t in s["tasks"]):
        sys.exit(f"ОШИБКА: задача {a.id} уже есть")
    if a.status not in FLOW:
        sys.exit(f"ОШИБКА: неизвестный статус {a.status}")
    s["tasks"].append({
        "id": a.id, "title": a.title, "feature": a.feature,
        "status": a.status, "owner": a.owner, "assignee": a.owner,
        "after": a.after.split(",") if a.after else [],
        "blocked": None, "staging_commit": None, "verdict": None,
        "created_at": now(),
    })
    save(s)
    print(f"OK: задача {a.id} → {a.owner} [{a.status}]")

def cmd_advance(s, a):
    t = find(s, a.task)
    b = blockers(s, t)
    if b:
        sys.exit(f"ОТКАЗ: {t['id']} заблокирована зависимостями: {', '.join(b)}")
    if t.get("blocked"):
        sys.exit(f"ОТКАЗ: {t['id']} помечена как blocked: {t['blocked']}")
    frm = t["status"]
    allowed = FLOW.get(frm, [])
    if not allowed:
        sys.exit(f"ОТКАЗ: из статуса {frm} двигаться некуда")
    if a.to:
        to = a.to
    elif len(allowed) == 1:
        to = allowed[0]
    else:
        sys.exit(f"ОТКАЗ: из {frm} несколько путей {allowed} — укажи --to явно")
    if to not in allowed:
        sys.exit(f"ОТКАЗ: переход {frm} → {to} запрещён. Разрешено: {allowed}")
    if to == "qa" and not t.get("staging_commit"):
        sys.exit("ОТКАЗ: нельзя в qa без staging_commit. Сначала: state.py staging <id> --commit <sha>")
    t["status"] = to
    no = STATUS_OWNER.get(to)
    t["owner"] = no if no else t.get("assignee") or t.get("owner")
    logit(s, t["id"], frm, to, a.note or "")
    save(s)
    print(f"OK: {t['id']} {frm} → {to} · владелец {t['owner']}")

def cmd_block(s, a):
    t = find(s, a.task); t["blocked"] = a.reason
    logit(s, t["id"], t["status"], t["status"], f"BLOCKED: {a.reason}")
    save(s); print(f"OK: {t['id']} заблокирована — {a.reason}")

def cmd_unblock(s, a):
    t = find(s, a.task); t["blocked"] = None
    logit(s, t["id"], t["status"], t["status"], "UNBLOCKED")
    save(s); print(f"OK: {t['id']} разблокирована")

def cmd_staging(s, a):
    t = find(s, a.task)
    if t["status"] not in ("dev", "code_review", "staging", "fix"):
        sys.exit(f"ОТКАЗ: {t['id']} в статусе {t['status']} — пуш в staging тут не имеет смысла")
    t["staging_commit"] = a.commit
    frm = t["status"]
    if frm in ("code_review", "dev", "fix"):
        t["status"] = "staging"; t["owner"] = "devops"
        logit(s, t["id"], frm, "staging", f"commit {a.commit}")
    t["status"] = "qa"; t["owner"] = "qa"
    logit(s, t["id"], "staging", "qa", f"деплой staging ок, commit {a.commit} — QA разблокирован")
    save(s)
    print(f"OK: {t['id']} → qa. QA разблокирован. commit={a.commit}")

def cmd_verdict(s, a):
    t = find(s, a.task)
    if t["status"] != "qa":
        sys.exit(f"ОТКАЗ: {t['id']} не в статусе qa (сейчас {t['status']})")
    if a.passed:
        t["verdict"] = "pass"; t["status"] = "release_ready"; t["owner"] = "tech-lead"
        logit(s, t["id"], "qa", "release_ready", f"QA pass. {a.note or ''}")
    else:
        t["verdict"] = "fail"; t["status"] = "fix"
        logit(s, t["id"], "qa", "fix", f"QA fail. {a.note or ''}")
    save(s)
    print(f"OK: {t['id']} вердикт {t['verdict']} → {t['status']}")

def write_board(s):
    L = []
    order = ["backlog","design","design_review","dev","code_review","staging","qa","fix","release_ready","prod","done"]
    L.append(f"_Обновлено: {s['updated_at']}_\n")
    if not s["tasks"]:
        L.append("_Пока пусто._")
    for st in order:
        ts = [t for t in s["tasks"] if t["status"] == st]
        if not ts:
            continue
        L.append(f"### {st} ({len(ts)})\n")
        L.append("| ID | Задача | Владелец | Блокер |")
        L.append("|---|---|---|---|")
        for t in ts:
            b = blockers(s, t)
            bl = t.get("blocked") or (", ".join(b) if b else "—")
            L.append(f"| `{t['id']}` | {t['title']} | `{t.get('owner','—')}` | {bl} |")
        L.append("")
    body = "\n".join(L)
    if os.path.exists(BOARD):
        src = open(BOARD, encoding="utf-8").read()
        if "<!-- BOARD:START -->" in src:
            pre = src.split("<!-- BOARD:START -->")[0]
            post = src.split("<!-- BOARD:END -->")[1] if "<!-- BOARD:END -->" in src else ""
            src = pre + "<!-- BOARD:START -->\n" + body + "\n<!-- BOARD:END -->" + post
            open(BOARD, "w", encoding="utf-8").write(src)

def cmd_board(s, a):
    write_board(s); print("OK: board.md перерисован")

def cmd_check(s, a):
    """Валидация состояния — для Наzorat и CI."""
    errs, warns = [], []
    ids = [t["id"] for t in s["tasks"]]
    if len(ids) != len(set(ids)):
        errs.append("дубликаты id задач")
    for t in s["tasks"]:
        if t["status"] not in FLOW:
            errs.append(f"{t['id']}: неизвестный статус {t['status']}")
        if t["status"] in ("qa","release_ready","prod") and not t.get("staging_commit"):
            errs.append(f"{t['id']}: статус {t['status']} без staging_commit — процесс обойдён")
        if t["status"] in ("release_ready","prod") and t.get("verdict") != "pass":
            errs.append(f"{t['id']}: статус {t['status']} без QA pass — процесс обойдён")
        if t.get("feature") and not any(f["id"] == t["feature"] for f in s["features"]):
            errs.append(f"{t['id']}: ссылается на несуществующую фичу {t['feature']}")
        for d in t.get("after", []):
            if d not in ids:
                errs.append(f"{t['id']}: зависимость {d} не существует")
        if not t.get("owner") and t["status"] not in ("done",):
            warns.append(f"{t['id']}: нет владельца")
    for f in s["features"]:
        p = os.path.join(ROOT, f.get("spec",""))
        if f.get("spec") and not os.path.exists(p):
            warns.append(f"фича {f['id']}: нет файла спеки {f['spec']}")
    print(f"Задач: {len(s['tasks'])} · фич: {len(s['features'])} · хендоффов: {len(s['log'])}")
    for e in errs:  print(f"  ОШИБКА:  {e}")
    for w in warns: print(f"  ВНИМАНИЕ: {w}")
    if not errs and not warns:
        print("  Состояние консистентно.")
    return 1 if errs else 0

def main():
    p = argparse.ArgumentParser(description="EduCRM state engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show")
    m = sub.add_parser("mine");        m.add_argument("role")
    f = sub.add_parser("feature-add"); f.add_argument("id"); f.add_argument("title"); f.add_argument("--modules"); f.add_argument("--roles")
    t = sub.add_parser("task-add");    t.add_argument("id"); t.add_argument("title"); t.add_argument("--feature", required=True); t.add_argument("--owner", required=True); t.add_argument("--status", default="backlog"); t.add_argument("--after")
    v = sub.add_parser("advance");     v.add_argument("task"); v.add_argument("--to"); v.add_argument("--note")
    b = sub.add_parser("block");       b.add_argument("task"); b.add_argument("--reason", required=True)
    u = sub.add_parser("unblock");     u.add_argument("task")
    g = sub.add_parser("staging");     g.add_argument("task"); g.add_argument("--commit", required=True)
    q = sub.add_parser("verdict");     q.add_argument("task"); q.add_argument("--note")
    q.add_argument("--pass", dest="passed", action="store_true"); q.add_argument("--fail", dest="failed", action="store_true")
    sub.add_parser("board"); sub.add_parser("check")
    a = p.parse_args()
    s = load()
    fn = {"show":cmd_show,"mine":cmd_mine,"feature-add":cmd_feature_add,"task-add":cmd_task_add,
          "advance":cmd_advance,"block":cmd_block,"unblock":cmd_unblock,"staging":cmd_staging,
          "verdict":cmd_verdict,"board":cmd_board,"check":cmd_check}[a.cmd]
    sys.exit(fn(s, a) or 0)

if __name__ == "__main__":
    main()

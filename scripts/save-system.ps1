# Сохранение системы агентов в GitHub.
# Запускается через 2-Сохранить-систему.bat
#
# Берёт ТОЛЬКО файлы системы агентов.
# Незаконченную работу в src и ~400 файлов с расхождением по окончаниям строк
# не трогает — поэтому здесь нет и не должно быть "git add -A".

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
chcp 65001 > $null

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  СОХРАНЕНИЕ СИСТЕМЫ АГЕНТОВ В GITHUB" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[ОШИБКА] Git не найден. Скачай: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Текущая ветка: $branch"
if ($branch -ne "staging") {
    Write-Host ""
    Write-Host "[СТОП] Система должна сохраняться в ветку staging, а ты на '$branch'." -ForegroundColor Yellow
    Write-Host "Ничего не делаю. Покажи это Клоду." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

$paths = @(
    "vault",
    "scripts",
    ".claude/agents",
    ".claude/commands",
    ".claude/settings.json",
    ".github/workflows/agent-handoff.yml",
    ".github/workflows/nazorat.yml",
    "CLAUDE.md",
    "ЗАПУСК.md",
    "НАЧНИ-ОТСЮДА.md",
    "2-Сохранить-систему.bat"
)

Write-Host "Добавляю файлы системы..."
foreach ($p in $paths) {
    if (Test-Path $p) { git add -- $p }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ВОТ ЧТО БУДЕТ СОХРАНЕНО:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
git diff --cached --name-status
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Всё остальное в проекте останется нетронутым."
Write-Host ""

$ok = Read-Host "Всё верно? Напиши: да"
if ($ok -ne "да") {
    Write-Host ""
    Write-Host "Отменено. Возвращаю всё как было..."
    git reset | Out-Null
    Write-Host "Готово, изменений нет."
    exit 0
}

Write-Host ""
Write-Host "Сохраняю..."
git commit -m "chore: система ИИ-агентов - vault, 10 ролей, движок хендоффов"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ОШИБКА] Не получилось сохранить. Покажи это окно Клоду." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Отправляю на GitHub..."
git push origin staging
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ОШИБКА] Сохранить получилось, отправить - нет." -ForegroundColor Red
    Write-Host "Возможно нужен вход в GitHub. Покажи это окно Клоду." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  ГОТОВО. Система сохранена и отправлена на GitHub." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Дальше: шаг 4 в файле НАЧНИ-ОТСЮДА.md (одна галочка на сайте GitHub)."

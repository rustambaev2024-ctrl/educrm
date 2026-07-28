@echo off
rem ASCII-only launcher. Russian text lives in scripts\save-system.ps1
rem because cmd.exe cannot parse UTF-8 Cyrillic inside .bat files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\save-system.ps1"
echo.
pause

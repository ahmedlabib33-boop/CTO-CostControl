@echo off
setlocal
title CTO CostControl - Review and Push Main
cd /d "%~dp0"

start "CTO CostControl - Review and Push Main" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\push_main.ps1" -RepoRoot "%~dp0" -Owner "ahmedlabib33-boop" -Repository "CTO-CostControl" -Branch "main"

if errorlevel 1 (
    echo.
    echo UPLOAD FAILED.
    pause
    exit /b 1
)

echo.
echo UPLOAD COMPLETED.
pause

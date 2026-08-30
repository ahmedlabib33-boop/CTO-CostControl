@echo off
setlocal
title CTO CostControl - Publish Changed Generated JSON
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish_generated_delta.ps1" -RepoRoot "%~dp0." -Owner "ahmedlabib33-boop" -Repository "CTO-CostControl" -Branch "main"

if errorlevel 1 (
    echo.
    echo UPLOAD FAILED.
    pause
    exit /b 1
)

echo.
echo UPLOAD COMPLETED.
pause

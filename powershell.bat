@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CTO CostControl - Publish Changed Generated JSON
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish_generated_delta.ps1" -RepoRoot "%~dp0." -Owner "ahmedlabib33-boop" -Repository "CTO-CostControl" -Branch "main" -MaxAttempts 6
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
    echo.
    echo UPLOAD FAILED.
    pause
    exit /b %RESULT%
)

echo.
echo UPLOAD COMPLETED.
pause
exit /b %RESULT%

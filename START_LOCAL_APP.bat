@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CTO CostControl - Start Local App
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start_local_app.ps1" -Root "%~dp0."
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo START_LOCAL_APP stopped with an error.
  pause
)
exit /b %RESULT%

@echo off
setlocal
title CTO CostControl - Review and Push Main
start "CTO CostControl - Review and Push Main" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0tools\push_main.ps1"
exit /b 0

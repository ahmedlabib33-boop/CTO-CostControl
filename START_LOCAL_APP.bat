@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo node_modules not found. Run INSTALL_AND_VERIFY.bat first.
  pause
  exit /b 1
)
call npm run dev

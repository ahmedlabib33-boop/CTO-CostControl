@echo off
setlocal
cd /d "%~dp0"
python -m watcher.generate "samples\INPUT\THE BIG cost Report 06.2026.xlsx" "samples\INPUT\Gloria Cost Report 06.2026.xlsx" --output "public\generated"
if errorlevel 1 pause

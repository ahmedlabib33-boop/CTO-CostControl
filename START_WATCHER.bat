@echo off
setlocal
cd /d "%~dp0"
if not exist INPUT mkdir INPUT
python -m watcher.watch --root "%CD%" --publish
if errorlevel 1 pause

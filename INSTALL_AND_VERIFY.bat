@echo off
setlocal
cd /d "%~dp0"
echo === CTO CostControl: install dependencies ===
call npm install
if errorlevel 1 goto :fail
echo.
echo === Python/data tests ===
call npm run test
if errorlevel 1 goto :fail
call npm run validate:data
if errorlevel 1 goto :fail
echo.
echo === Next.js production build ===
call npm run build
if errorlevel 1 goto :fail
echo.
echo ALL LOCAL VERIFICATION GATES PASSED.
exit /b 0
:fail
echo.
echo VERIFICATION FAILED. Review the error above. Nothing should be published until this passes.
pause
exit /b 1

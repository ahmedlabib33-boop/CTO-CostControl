@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "OLD_WORKBOOKS_DIR=%CD%\Old workbooks"
if not exist "%OLD_WORKBOOKS_DIR%" mkdir "%OLD_WORKBOOKS_DIR%"

echo ============================================================
echo CTO CostControl - Restore Historical Workbooks
echo Source: %OLD_WORKBOOKS_DIR%
echo Metadata controls project identity and report period.
echo Existing history is preserved. This script does NOT publish.
echo ============================================================
echo.

python -m watcher.restore_history --root "%CD%" --source "%OLD_WORKBOOKS_DIR%"
set "RESTORE_RESULT=%ERRORLEVEL%"

echo.
echo === Python tests ===
call npm run test
if errorlevel 1 goto :fail

echo.
echo === Project isolation and workbook completeness ===
call npm run validate:data
if errorlevel 1 goto :fail

echo.
echo === TypeScript validation ===
call npx tsc --noEmit --incremental false
if errorlevel 1 goto :fail

echo.
echo === Next.js production build ===
call npm run build
if errorlevel 1 goto :fail

if not "%RESTORE_RESULT%"=="0" goto :restore_attention

echo.
echo RESTORE AND ALL VALIDATION GATES PASSED.
echo Historical JSON has been updated locally. Nothing was published.
exit /b 0

:restore_attention
echo.
echo VALIDATION GATES PASSED, BUT ONE OR MORE WORKBOOKS WERE BLOCKED,
echo FAILED, OR THE FOLDER WAS EMPTY. Review:
echo %CD%\.runtime\restore-old-workbooks-report.json
echo and the red identity alerts in Monthly Intelligence ^& Data Quality.
exit /b %RESTORE_RESULT%

:fail
echo.
echo VALIDATION FAILED. Existing validated history/latest data was not deleted.
exit /b 1

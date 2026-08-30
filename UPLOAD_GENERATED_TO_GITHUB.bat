@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0"

set "EXPECTED_REMOTE=https://github.com/ahmedlabib33-boop/CTO-CostControl.git"
set "TARGET_BRANCH=main"

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available in PATH.
  exit /b 1
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "ACTUAL_REMOTE=%%R"
if not defined ACTUAL_REMOTE (
  echo ERROR: Git remote "origin" was not found.
  exit /b 1
)

if /i not "%ACTUAL_REMOTE%"=="%EXPECTED_REMOTE%" (
  echo ERROR: Refusing to push to an unexpected repository.
  echo Expected: %EXPECTED_REMOTE%
  echo Actual:   %ACTUAL_REMOTE%
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /i not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
  echo ERROR: Current branch is "%CURRENT_BRANCH%". Expected "%TARGET_BRANCH%".
  exit /b 1
)

if not exist "public\generated\projects.json" (
  echo ERROR: public\generated\projects.json was not found.
  exit /b 1
)

echo Staging only public\generated ...
git add -- "public/generated"
if errorlevel 1 (
  echo ERROR: Git could not stage public\generated.
  exit /b 1
)

git diff --cached --quiet -- "public/generated"
if not errorlevel 1 (
  echo No generated JSON changes were found. Nothing was committed or pushed.
  exit /b 0
)

git commit -m "chore(data): publish validated cost-control update" -- "public/generated"
if errorlevel 1 (
  echo ERROR: Commit failed. Nothing was pushed.
  exit /b 1
)

echo.
echo Paste a GitHub fine-grained token with Contents: Read and write permission.
echo The token will not be displayed or saved in the repository or Git remote.

for /f "usebackq delims=" %%T in (`powershell.exe -NoLogo -NoProfile -Command "$s=Read-Host 'GitHub token' -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"`) do set "GITHUB_TOKEN=%%T"

if not defined GITHUB_TOKEN (
  echo ERROR: No token was entered. The commit exists locally but was not pushed.
  exit /b 1
)

for /f "usebackq delims=" %%A in (`powershell.exe -NoLogo -NoProfile -Command "$raw='x-access-token:'+$env:GITHUB_TOKEN; [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($raw))"`) do set "GITHUB_BASIC_AUTH=%%A"

set "GITHUB_TOKEN="
if not defined GITHUB_BASIC_AUTH (
  echo ERROR: Could not prepare GitHub authentication. The commit exists locally but was not pushed.
  exit /b 1
)

set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=http.https://github.com/.extraHeader"
set "GIT_CONFIG_VALUE_0=Authorization: Basic %GITHUB_BASIC_AUTH%"
set "GITHUB_BASIC_AUTH="

echo Pushing %TARGET_BRANCH% to %EXPECTED_REMOTE% ...
git push origin "%TARGET_BRANCH%"
set "PUSH_RESULT=%ERRORLEVEL%"

set "GIT_CONFIG_COUNT="
set "GIT_CONFIG_KEY_0="
set "GIT_CONFIG_VALUE_0="

if not "%PUSH_RESULT%"=="0" (
  echo ERROR: Push failed. The commit remains local and can be pushed later.
  exit /b %PUSH_RESULT%
)

echo.
echo SUCCESS: public\generated was committed and pushed to GitHub.
echo Vercel should now start its Git deployment from branch %TARGET_BRANCH%.
exit /b 0

@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title CourseCompass AI - setup

echo.
echo ===============================================
echo   CourseCompass AI - one-time setup
echo ===============================================
echo.

rem ---------------------------------------------------------------- Python
set "PY="
where py >nul 2>&1
if not errorlevel 1 (
  for %%V in (3.13 3.12 3.14) do (
    if not defined PY (
      py -%%V -c "import sys" >nul 2>&1
      if not errorlevel 1 set "PY=py -%%V"
    )
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3, 12) <= sys.version_info[:2] <= (3, 14) else 1)" >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  echo [X] Python 3.12, 3.13 or 3.14 was not found.
  echo     Install Python 3.13 from https://www.python.org/downloads/windows/
  echo     and tick "Add python.exe to PATH", then open a NEW terminal and run setup.bat again.
  goto :fail
)
for /f "delims=" %%I in ('%PY% --version 2^>^&1') do echo [OK] %%I  ^(using "%PY%"^)

rem ---------------------------------------------------------------- Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js was not found. Install Node.js 22 LTS or newer from https://nodejs.org/
  echo     then open a NEW terminal and run setup.bat again.
  goto :fail
)
for /f "tokens=1,2 delims=v." %%a in ('node -v') do (
  set "NODE_MAJOR=%%a"
  set "NODE_MINOR=%%b"
)
for /f "delims=" %%I in ('node -v') do set "NODE_VERSION=%%I"
if !NODE_MAJOR! LSS 20 (
  echo [X] Node.js !NODE_VERSION! is too old. Install Node.js 20.19+, 22.12+ or newer.
  goto :fail
)
if !NODE_MAJOR! EQU 20 if !NODE_MINOR! LSS 19 (
  echo [X] Node.js !NODE_VERSION! is too old. Install Node.js 20.19+, 22.12+ or newer.
  goto :fail
)
if !NODE_MAJOR! EQU 21 (
  echo [X] Node.js !NODE_VERSION! is not supported by Vite. Install Node.js 20.19+, 22.12+ or newer.
  goto :fail
)
if !NODE_MAJOR! EQU 22 if !NODE_MINOR! LSS 12 (
  echo [X] Node.js !NODE_VERSION! is too old. Install Node.js 20.19+, 22.12+ or newer.
  goto :fail
)
echo [OK] Node.js !NODE_VERSION!
where npm >nul 2>&1
if errorlevel 1 (
  echo [X] npm was not found. Reinstall Node.js with the default options.
  goto :fail
)

rem ---------------------------------------------------------------- backend
echo.
echo [..] Creating the Python virtual environment in backend\.venv
if not exist "backend\.venv\Scripts\python.exe" (
  %PY% -m venv "backend\.venv"
  if errorlevel 1 (
    echo [X] Could not create the virtual environment.
    goto :fail
  )
)
echo [..] Installing backend packages (first run downloads about 100 MB)
"backend\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q --upgrade pip
"backend\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "backend\requirements.txt"
if errorlevel 1 (
  echo [X] Installing backend packages failed. Check your internet connection and run setup.bat again.
  goto :fail
)
echo [OK] Backend packages installed

echo [..] Preparing course data, demo cohort and evaluation report
pushd backend
".venv\Scripts\python.exe" -m app.setup_check
if errorlevel 1 (
  popd
  echo [X] Data check failed. See the message above.
  goto :fail
)
popd

rem ---------------------------------------------------------------- frontend
echo.
echo [..] Installing frontend packages from package-lock.json
pushd frontend
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo [!] npm ci failed - retrying with npm install
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo [X] Installing frontend packages failed. Check your internet connection and run setup.bat again.
    goto :fail
  )
)
if not exist ".env" copy /y ".env.example" ".env" >nul
popd
echo [OK] Frontend packages installed

echo.
echo ===============================================
echo   Setup complete. Start the app with run.bat
echo ===============================================
echo.
pause
exit /b 0

:fail
echo.
echo Setup did not finish. Fix the problem above and run setup.bat again.
echo More help: README.md, section "Troubleshooting".
pause
exit /b 1

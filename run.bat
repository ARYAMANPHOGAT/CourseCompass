@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title CourseCompass AI

if not defined COURSECOMPASS_API_PORT set "COURSECOMPASS_API_PORT=8000"
set "API_PORT=%COURSECOMPASS_API_PORT%"
set "WEB_PORT=5173"
set "API_URL=http://127.0.0.1:%API_PORT%"
set "WEB_URL=http://127.0.0.1:%WEB_PORT%"

if not exist "backend\.venv\Scripts\python.exe" (
  echo [X] Setup has not been run yet. Double-click setup.bat first.
  pause
  exit /b 1
)
if not exist "frontend\node_modules" (
  echo [X] Frontend packages are missing. Run setup.bat first.
  pause
  exit /b 1
)
where curl.exe >nul 2>&1
if errorlevel 1 (
  echo [X] curl.exe was not found ^(it ships with Windows 10 1803+ and Windows 11^).
  pause
  exit /b 1
)

echo.
echo ===============================================
echo   Starting CourseCompass AI
echo ===============================================

rem ---------------------------------------------------------------- backend
curl.exe -s -f -o nul "%API_URL%/api/health" >nul 2>&1
if not errorlevel 1 (
  echo [OK] Backend already running at %API_URL% - not starting a second copy.
) else (
  echo [..] Starting the backend ^(FastAPI^) in a new window ...
  start "CourseCompass API (close to stop)" "%~dp0scripts\start-backend.bat" %API_PORT%
)
set /a TRIES=0
:wait_api
curl.exe -s -f -o nul "%API_URL%/api/health" >nul 2>&1
if not errorlevel 1 goto api_up
set /a TRIES+=1
if !TRIES! GEQ 90 goto api_fail
timeout /t 1 /nobreak >nul
goto wait_api
:api_up
echo [OK] Backend ready: %API_URL%   ^(API docs: %API_URL%/docs^)

rem ---------------------------------------------------------------- frontend
curl.exe -s -f -o nul "%WEB_URL%" >nul 2>&1
if not errorlevel 1 (
  echo [OK] Frontend already running at %WEB_URL% - not starting a second copy.
) else (
  echo [..] Starting the frontend ^(Vite^) in a new window ...
  start "CourseCompass Web (close to stop)" "%~dp0scripts\start-frontend.bat" %API_PORT%
)
set /a TRIES=0
:wait_web
curl.exe -s -f -o nul "%WEB_URL%" >nul 2>&1
if not errorlevel 1 goto web_up
set /a TRIES+=1
if !TRIES! GEQ 90 goto web_fail
timeout /t 1 /nobreak >nul
goto wait_web
:web_up
echo [OK] Frontend ready: %WEB_URL%

start "" "%WEB_URL%"
echo.
echo ===============================================
echo   CourseCompass AI is running
echo     App:      %WEB_URL%
echo     API:      %API_URL%/api/health
echo     API docs: %API_URL%/docs
echo.
echo   To stop: close the two windows named
echo   "CourseCompass API" and "CourseCompass Web"
echo   ^(or press Ctrl+C inside each of them^).
echo ===============================================
echo.
pause
exit /b 0

:api_fail
echo [X] The backend did not start within 90 seconds.
echo     Look at the "CourseCompass API" window for the error.
echo     Common causes: port %API_PORT% is used by another program ^(set COURSECOMPASS_API_PORT=8010 then run.bat^),
echo     or setup.bat did not finish.
pause
exit /b 1

:web_fail
echo [X] The frontend did not start within 90 seconds.
echo     Look at the "CourseCompass Web" window for the error.
echo     Common cause: port %WEB_PORT% is used by another program - close it and run run.bat again.
pause
exit /b 1

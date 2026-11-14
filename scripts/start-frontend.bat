@echo off
rem Started by run.bat in its own window. Close this window (or press Ctrl+C) to stop the frontend.
setlocal
cd /d "%~dp0..\frontend"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"
set "VITE_API_BASE_URL=http://127.0.0.1:%PORT%/api"
title CourseCompass Web (close to stop)
echo CourseCompass web app on http://127.0.0.1:5173  - close this window to stop it.
call npm run dev
echo.
echo The frontend stopped. If this was unexpected, read the error above.
pause

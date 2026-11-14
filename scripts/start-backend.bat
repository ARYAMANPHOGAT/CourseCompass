@echo off
rem Started by run.bat in its own window. Close this window (or press Ctrl+C) to stop the backend.
setlocal
cd /d "%~dp0..\backend"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"
title CourseCompass API (close to stop)
echo CourseCompass API on http://127.0.0.1:%PORT%  - close this window to stop it.
".venv\Scripts\python.exe" -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port %PORT%
echo.
echo The backend stopped. If this was unexpected, read the error above.
pause

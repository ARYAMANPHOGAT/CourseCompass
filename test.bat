@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CourseCompass AI - tests
if not exist "backend\.venv\Scripts\python.exe" (
  echo [X] Run setup.bat first.
  pause
  exit /b 1
)
set "FAILED="

echo.
echo === Backend tests (pytest) ===
pushd backend
".venv\Scripts\python.exe" -m pytest -q
if errorlevel 1 set "FAILED=%FAILED% backend-tests"
popd

echo.
echo === Frontend tests (vitest) ===
pushd frontend
call npm test
if errorlevel 1 set "FAILED=%FAILED% frontend-tests"

echo.
echo === Frontend type check and production build ===
call npm run build
if errorlevel 1 set "FAILED=%FAILED% frontend-build"
popd

echo.
if defined FAILED (
  echo [X] Failed:%FAILED%
  pause
  exit /b 1
)
echo [OK] All backend tests, frontend tests and the production build passed.
pause
exit /b 0

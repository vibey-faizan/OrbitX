@echo off
rem Starts a local web server for ORBITX and opens it in the default browser.
rem (Browsers block JavaScript modules when index.html is opened directly from disk.)
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it from https://www.python.org/ and try again.
  pause
  exit /b 1
)
echo ORBITX is running at http://localhost:8000  -  close this window to stop it.
start "" http://localhost:8000
python -m http.server 8000

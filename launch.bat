@echo off
setlocal
cd /d "%~dp0"
title RescueMesh - Shubham Parmar

echo RescueMesh - Shubham Parmar
echo.
for %%F in (RescueMesh.html build_data.py requirements.txt) do (
    if not exist "%%F" (
        echo ERROR: %%F is missing.
        echo Extract the complete RescueMesh_GitHub_Ready ZIP first, then put launch.bat in that folder.
        goto :failed
    )
)

where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "RM_PY=py -3"
        goto :python_ready
    )
)
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "RM_PY=python"
        goto :python_ready
    )
)
echo ERROR: Python 3.10 or newer was not found.
echo Install Python from https://www.python.org/downloads/windows/
echo Enable Add Python to PATH during installation, then run this launcher again.
goto :failed

:python_ready
rem Reuse an existing valid dataset without accessing the internet.
if exist "data.json" (
    %RM_PY% -c "import json; from pathlib import Path; from build_data import validate_data; validate_data(json.loads(Path('data.json').read_text(encoding='utf-8')))" >nul 2>&1
    if not errorlevel 1 (
        echo Using the existing dataset...
        %RM_PY% build_data.py --embed-only data.json
        if errorlevel 1 goto :failed
        goto :open_app
    )
)

echo Creating a private Python environment...
if not exist ".venv\Scripts\python.exe" (
    %RM_PY% -m venv .venv
    if errorlevel 1 goto :failed
)
echo Installing data-builder dependencies. Internet access is required.
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo Downloading OpenStreetMap data. This may take several minutes.
echo If a data-quality or network check fails, read the message below and README.md.
".venv\Scripts\python.exe" build_data.py
if errorlevel 1 goto :failed

:open_app
echo.
echo Opening RescueMesh...
start "" "%~dp0RescueMesh.html"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo RescueMesh could not finish setup. Review the error above.
echo No substitute Bengaluru data has been generated.
pause
exit /b 1

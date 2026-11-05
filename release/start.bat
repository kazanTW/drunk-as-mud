@echo off

cd /d "%~dp0"

".\runtime\node.exe" ".\server.js"

if errorlevel 1 (
    echo.
    echo drunk-as-mud exited with an error.
    pause
)

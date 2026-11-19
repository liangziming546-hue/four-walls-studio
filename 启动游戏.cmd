@echo off
setlocal
chcp 65001 >nul
title Four Walls Studio
cd /d "%~dp0"

set "GAME_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined GAME_NODE set "GAME_NODE=%%N"
if not defined GAME_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "GAME_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined GAME_NODE (
  echo [ERROR] Node.js was not found. Install Node.js and try again.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
  echo [ERROR] Game components are missing. Run npm install in this folder.
  pause
  exit /b 1
)

echo Starting Four Walls Studio. Your browser will open automatically.
echo Keep this window open while playing. Press Ctrl+C to stop.
echo.
"%GAME_NODE%" "%~dp0node_modules\vite\bin\vite.js" --host 127.0.0.1 --open
if errorlevel 1 (
  echo.
  echo [ERROR] The game could not start. Please copy the error above.
  pause
  exit /b 1
)
endlocal

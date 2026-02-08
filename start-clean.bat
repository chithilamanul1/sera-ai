@echo off
echo [Sera Auto] Cleaning up old processes...
taskkill /F /IM node.exe >nul 2>&1
echo [Sera Auto] Removing lockfiles...
if exist ".next\dev\lock" (
    rmdir /s /q ".next\dev\lock"
)
echo [Sera Auto] Starting Development Server...
npm run dev
pause

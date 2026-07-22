@echo off
title Mobitech ERP Launcher
cd /d "C:\Users\surface\.gemini\antigravity\scratch\mobitech-erp"
echo Starting Mobitech ERP dev server...
start cmd /c "timeout /t 5 && start http://localhost:3000"
npm run dev

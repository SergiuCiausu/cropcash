@echo off
rem Run by the "Subventii Monitor" scheduled task. A crashed run is retried once,
rem and the retry picks up whatever was still due.
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
echo === %date% %time% >> data\logs\monitor.log
call npm run monitor >> data\logs\monitor.log 2>&1
if errorlevel 1 (
  echo === retry %date% %time% >> data\logs\monitor.log
  call npm run monitor >> data\logs\monitor.log 2>&1
)

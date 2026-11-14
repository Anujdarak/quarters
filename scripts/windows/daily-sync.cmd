@echo off
rem Daily data refresh, run by Windows Task Scheduler ("Quarters daily sync").
rem Mondays also refresh the company master (new listings, delistings).
cd /d "%~dp0\..\.."
if not exist data\logs mkdir data\logs
echo ==== %date% %time% ==== >> data\logs\sync.log
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).DayOfWeek"') do set DOW=%%d
if "%DOW%"=="Monday" call npm run import:master -- --upstox >> data\logs\sync.log 2>&1
call npm run sync >> data\logs\sync.log 2>&1

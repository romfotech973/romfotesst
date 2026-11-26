@echo off
cd /d "%~dp0"
python start_portal.py
if errorlevel 1 pause

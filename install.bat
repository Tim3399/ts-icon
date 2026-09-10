@echo off
cd /d "%~dp0"
call npm run setup -- %*
exit /b %errorlevel%

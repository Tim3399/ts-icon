@echo off
title ts-icon Dev Startup (bun)
cd /d "%~dp0"

echo ============================================
echo   ts-icon - Dev Startup mit Bun
echo ============================================
echo.

echo [1/4] Backend Dependencies installieren...
call bun install
if %errorlevel% neq 0 (echo FEHLER bei bun install & pause & exit /b 1)

echo.
echo [2/4] Prisma Client generieren...
call bunx prisma generate
if %errorlevel% neq 0 (echo FEHLER bei prisma generate & pause & exit /b 1)

echo.
echo [3/4] Frontend Dependencies installieren...
cd webapp-banner-tool
call bun install
if %errorlevel% neq 0 (echo FEHLER bei Frontend bun install & pause & exit /b 1)
cd ..

echo.
echo [4/4] Services starten...
echo.

REM Backend bauen
call bun run build
if %errorlevel% neq 0 (echo FEHLER beim Build & pause & exit /b 1)

echo.
echo Starte Public Backend  (Port 3000)...
start "ts-icon Public (3000)" cmd /k "cd /d %~dp0 && bun run start:public"

echo Starte Local Backend   (Port 3001)...
start "ts-icon Local (3001)" cmd /k "cd /d %~dp0 && bun run start:local"

echo Starte Frontend         (Port 5173)...
start "ts-icon Frontend (5173)" cmd /k "cd /d %~dp0\webapp-banner-tool && bun run dev"

echo.
echo ============================================
echo   Alle Services gestartet!
echo.
echo   Frontend:       http://localhost:5173
echo   Backend Local:  http://localhost:3001/swagger
echo   Backend Public: http://localhost:3000
echo ============================================
echo.
echo Dieses Fenster kann geschlossen werden.
echo Zum Beenden alle "ts-icon"-Fenster schliessen.
pause

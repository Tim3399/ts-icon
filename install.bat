@echo off
REM Installiert alle Dependencies fuer Backend und Frontend

echo === Backend-Dependencies installieren ===
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo === Prisma Client generieren ===
call npx prisma generate
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo === Frontend-Dependencies installieren ===
cd webapp-banner-tool
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%
cd ..

echo.
echo === Fertig! ===
echo Backend starten:   npm run build ^&^& npm run start:local
echo Frontend starten:  cd webapp-banner-tool ^&^& npm run dev

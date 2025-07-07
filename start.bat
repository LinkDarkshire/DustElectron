@echo off
echo ================================
echo   Dust Game Manager Dev Tools
echo ================================
echo.
echo Wähle eine Option:
echo [1] Normale Anwendung starten
echo [2] Development Mode (mit DevTools)
echo [3] Dependencies installieren/updaten
echo [4] Projekt bereinigen (node_modules löschen)
echo [5] Build erstellen
echo [6] Beenden
echo.

set /p choice="Deine Wahl (1-6): "

REM Wechsel zum Projektverzeichnis
cd /d "%~dp0"

if "%choice%"=="1" goto start_normal
if "%choice%"=="2" goto start_dev
if "%choice%"=="3" goto install_deps
if "%choice%"=="4" goto clean_project
if "%choice%"=="5" goto build_project
if "%choice%"=="6" goto end
goto invalid_choice

:start_normal
echo.
echo Starte Dust Game Manager (Normal)...
npm start
goto end

:start_dev
echo.
echo Starte Dust Game Manager (Development Mode)...
REM Setze Development Environment Variable
set NODE_ENV=development
npm run dev
goto end

:install_deps
echo.
echo Installiere/Update Dependencies...
npm install
echo Dependencies aktualisiert!
pause
goto end

:clean_project
echo.
echo Lösche node_modules Ordner...
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo node_modules Ordner gelöscht!
) else (
    echo node_modules Ordner existiert nicht.
)
echo.
echo Installiere Dependencies neu...
npm install
echo Projekt bereinigt und Dependencies neu installiert!
pause
goto end

:build_project
echo.
echo Erstelle Build...
npm run build
echo Build erstellt!
pause
goto end

:invalid_choice
echo.
echo Ungültige Eingabe! Bitte wähle 1-6.
pause
goto end

:end
echo.
echo Auf Wiedersehen!
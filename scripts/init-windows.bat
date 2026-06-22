@echo off
setlocal enabledelayedexpansion

echo   Thread — Windows Environment Setup
where git >nul 2>nul
if !errorlevel! neq 0 (
    echo [Error] 'git' is not installed. Git is required to download the Emscripten SDK.
    echo         Install from: https://git-scm.com/downloads
    exit /b 1
) else (
    echo [Setup] 'git' is available.
)

where make >nul 2>nul
if !errorlevel! neq 0 (
    echo [Setup] 'make' not found. Installing via winget...
    echo.

    where winget >nul 2>nul
    if !errorlevel! neq 0 (
        echo [Error] winget is not available on this system.
        echo         Please install 'make' manually:
        echo           - Option A: Install Chocolatey, then run: choco install make
        echo           - Option B: Install Scoop, then run: scoop install make
        echo           - Option C: Download GnuWin32 Make from: https://gnuwin32.sourceforge.net/packages/make.htm
        echo.
        echo         After installing make, re-run this script.
        exit /b 1
    )

    winget install GnuWin32.Make --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [Error] Failed to install make via winget.
        echo         Try installing manually with: choco install make
        exit /b 1
    )

    echo.
    echo [Setup] 'make' installed successfully.
    echo [IMPORTANT] You must RESTART your terminal for 'make' to be available in PATH.
    echo           Please close this window, open a new one, and run this script again.
    echo.
    pause
    exit /b 0
) else (
    echo [Setup] 'make' is already installed.
)

echo.
echo [Setup] Setting up Emscripten SDK...
call "%~dp0setup-emsdk.bat"
if !errorlevel! neq 0 (
    echo [Error] Failed to setup Emscripten SDK.
    exit /b 1
)

echo.
echo [Setup] Installing NPM dependencies...
cd /d "%~dp0.."
call npm install
if !errorlevel! neq 0 (
    echo [Error] npm install failed.
    exit /b 1
)
echo.
echo [Setup] Running full build (WASM + Webpack)...
call npm run build
if !errorlevel! neq 0 (
    echo [Error] Build failed. Check the output above for details.
    exit /b 1
)

echo   Setup Complete!
echo     1. Open chrome://extensions/
echo     2. Enable Developer mode
echo     3. Click "Load unpacked" and select the dist/ folder
pause
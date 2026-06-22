@echo off
setlocal enabledelayedexpansion

echo Setting up Emscripten SDK...

set "PROJECT_DIR=%~dp0.."
set "EMSDK_DIR=%PROJECT_DIR%\emsdk"
set "EMCC_PATH=%EMSDK_DIR%\upstream\emscripten\emcc"

if exist "%EMCC_PATH%" (
    echo emcc already installed at %EMCC_PATH%
    exit /b 0
)

if not exist "%EMSDK_DIR%" (
    echo Cloning emsdk repository...
    git clone https://github.com/emscripten-core/emsdk.git "%EMSDK_DIR%"
    if !errorlevel! neq 0 (
        echo Failed to clone emsdk. Make sure git is installed and try again.
        echo You can also manually download from: https://emscripten.org/docs/getting_started/downloads.html
        exit /b 1
    )
)

cd /d "%EMSDK_DIR%"

echo Installing latest Emscripten SDK (this may take a few minutes)...
call emsdk.bat install latest
if !errorlevel! neq 0 (
    echo emsdk install failed.
    exit /b 1
)

echo Activating Emscripten SDK...
call emsdk.bat activate latest
if !errorlevel! neq 0 (
    echo emsdk activate failed.
    exit /b 1
)

echo Emscripten SDK setup complete.
exit /b 0

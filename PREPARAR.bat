@echo off
rem Baixa o Node portatil, o yt-dlp e o FFmpeg para dentro desta pasta (uma vez por maquina).
rem Use "PREPARAR.bat -Forcar" para baixar tudo de novo.
cd /d "%~dp0"
title Baixador de Audios - Preparar esta maquina
echo Preparando o Baixador de Audios nesta maquina...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%NAO_PAUSAR%"=="1" pause
exit /b %RC%

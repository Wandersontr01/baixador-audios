@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Baixador de Audios - DIAGNOSTICO

rem Usa o Node que vem na pasta (runtime\node.exe). Nao precisa instalar nada.
set "NODE=%~dp0runtime\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERRO] Nao encontrei runtime\node.exe nesta pasta.
    echo Rode o PREPARAR.bat primeiro.
    pause
    exit /b 1
  )
  set "NODE=node"
)

if not exist "%~dp0bin\yt-dlp.exe" (
  echo [AVISO] bin\yt-dlp.exe nao encontrado - talvez o antivirus tenha removido.
  echo Vou tentar baixar de novo ao iniciar.
)

rem Encerra uma instancia anterior que ainda esteja usando a porta 3940
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3940 .*LISTENING" /c:":3940 .*ESCUTANDO"') do (
  echo Encerrando execucao anterior ^(PID %%p^)...
  taskkill /PID %%p /F >nul 2>nul
)

echo Abrindo o Baixador no navegador...
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3940"
echo.
echo ====================================================
echo  Baixador rodando. NAO FECHE esta janela enquanto usar.
echo  Endereco: http://localhost:3940
echo  Para encerrar: feche esta janela.
echo ====================================================
"%NODE%" server.js
pause

@echo off
rem Inicia o Baixador SEM janela: o servidor roda escondido e o navegador abre sozinho.
rem Para ver a saida na tela (diagnostico), use "DIAGNOSTICO (com janela).bat".
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
  echo Primeira vez nesta maquina: preparando...
  set NAO_PAUSAR=1
  call "%~dp0PREPARAR.bat"
  if not exist "%~dp0runtime\node.exe" ( pause & exit /b 1 )
)
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~dp0runtime\node.exe' -ArgumentList 'server.js','--oculto','--abrir' -WorkingDirectory '%~dp0.' -WindowStyle Hidden"
exit

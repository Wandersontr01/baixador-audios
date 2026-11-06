' Abre o Baixador de Audios sem janela de prompt.
' Na primeira vez numa maquina (sem runtime\node.exe), roda o PREPARAR.bat antes.
' O servidor roda escondido e se encerra sozinho 5 min depois que a pagina e fechada
' (ou pelo botao "Encerrar" na pagina). Saida/erros ficam em baixador.log.
Option Explicit
Dim sh, fso, pasta, node, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
node = pasta & "\runtime\node.exe"
sh.CurrentDirectory = pasta
If Not fso.FileExists(node) Or Not fso.FileExists(pasta & "\bin\yt-dlp.exe") Then
  If MsgBox("Primeira vez nesta maquina: preciso baixar o Node, o yt-dlp e o FFmpeg (~120 MB) para dentro da pasta do Baixador. Continuar?", vbOKCancel + vbQuestion, "Baixador de Audios") <> vbOK Then WScript.Quit
  sh.Environment("Process")("NAO_PAUSAR") = "1"
  rc = sh.Run("cmd /c """ & pasta & "\PREPARAR.bat""", 1, True)
  If rc <> 0 Or Not fso.FileExists(node) Then
    MsgBox "A preparacao falhou. Rode o PREPARAR.bat para ver o erro.", vbCritical, "Baixador de Audios"
    WScript.Quit
  End If
End If
sh.Run """" & node & """ """ & pasta & "\server.js"" --oculto --abrir", 0, False

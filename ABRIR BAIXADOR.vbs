' Abre o Baixador sem janela de prompt.
' - Na primeira vez numa maquina sem runtime\node.exe (copia vinda do git), roda o PREPARAR.bat.
'   A versao portatil das Releases ja vem com tudo e pula esse passo.
' - Na primeira execucao, oferece criar um atalho na Area de Trabalho.
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
  If MsgBox("Primeira vez nesta maquina: preciso baixar o Node, o yt-dlp e o FFmpeg (~120 MB) para dentro da pasta do Baixador. Continuar?" & vbCrLf & vbCrLf & "Dica: a versao portatil (Releases do GitHub) ja vem com tudo e nao precisa deste passo.", vbOKCancel + vbQuestion, "Baixador") <> vbOK Then WScript.Quit
  sh.Environment("Process")("NAO_PAUSAR") = "1"
  rc = sh.Run("cmd /c """ & pasta & "\PREPARAR.bat""", 1, True)
  If rc <> 0 Or Not fso.FileExists(node) Then
    MsgBox "A preparacao falhou. Rode o PREPARAR.bat para ver o erro.", vbCritical, "Baixador"
    WScript.Quit
  End If
End If

sh.Run """" & node & """ """ & pasta & "\server.js"" --oculto --abrir", 0, False

' ---------- atalho na Area de Trabalho ----------
Const DESCRICAO = "Baixador de audio e video"
Dim lnkPath, lnk
lnkPath = sh.SpecialFolders("Desktop") & "\Baixador.lnk"
If fso.FileExists(lnkPath) Then
  ' se a pasta do Baixador mudou de lugar, atualiza o atalho (so se for o nosso)
  Set lnk = sh.CreateShortcut(lnkPath)
  If lnk.Description = DESCRICAO And InStr(1, lnk.Arguments, pasta & "\", vbTextCompare) = 0 Then CriarAtalho
ElseIf Not fso.FileExists(pasta & "\.sem-atalho") Then
  If MsgBox("Criar um atalho do Baixador na Area de Trabalho?" & vbCrLf & "Assim, nas proximas vezes, e so clicar no icone.", vbYesNo + vbQuestion, "Baixador") = vbYes Then
    CriarAtalho
  Else
    fso.CreateTextFile(pasta & "\.sem-atalho", True).Close
  End If
End If

Sub CriarAtalho
  Set lnk = sh.CreateShortcut(lnkPath)
  lnk.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
  lnk.Arguments = """" & pasta & "\ABRIR BAIXADOR.vbs"""
  lnk.WorkingDirectory = pasta
  If fso.FileExists(pasta & "\baixador.ico") Then lnk.IconLocation = pasta & "\baixador.ico,0"
  lnk.Description = DESCRICAO
  lnk.Save
End Sub

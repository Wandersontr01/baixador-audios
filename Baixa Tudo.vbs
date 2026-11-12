' Baixa Tudo - abre o app sem janela de prompt.
' Tudo o que o app usa fica na subpasta "app"; este e o unico arquivo para executar.
' - Copia vinda do git (sem app\runtime\node.exe): roda o app\PREPARAR.bat na primeira vez.
'   A versao portatil (Releases do GitHub) ja vem com tudo.
' - Migra pastas da versao antiga (arquivos soltos na raiz) para dentro de "app".
' - Na primeira execucao, oferece um atalho na Area de Trabalho.
' O servidor roda escondido e se encerra sozinho 5 min depois que a pagina e fechada
' (ou pelo botao "Encerrar"). Saida/erros ficam em app\baixatudo.log.
Option Explicit
Dim sh, fso, raiz, app, node, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(WScript.ScriptFullName)
app = raiz & "\app"
node = app & "\runtime\node.exe"

If Not fso.FileExists(app & "\server.js") Then
  MsgBox "Nao encontrei a pasta ""app"" ao lado deste arquivo." & vbCrLf & "Extraia o ZIP inteiro de novo (a pasta app precisa ficar junto do Baixa Tudo.vbs).", vbCritical, "Baixa Tudo"
  WScript.Quit
End If

MigrarVersaoAntiga
sh.CurrentDirectory = app

If Not fso.FileExists(node) Or Not fso.FileExists(app & "\bin\yt-dlp.exe") Then
  If MsgBox("Primeira vez nesta maquina: preciso baixar o Node, o yt-dlp e o FFmpeg (~120 MB) para dentro da pasta do Baixa Tudo. Continuar?" & vbCrLf & vbCrLf & "Dica: a versao portatil (Releases do GitHub) ja vem com tudo e nao precisa deste passo.", vbOKCancel + vbQuestion, "Baixa Tudo") <> vbOK Then WScript.Quit
  sh.Environment("Process")("NAO_PAUSAR") = "1"
  rc = sh.Run("cmd /c """ & app & "\PREPARAR.bat""", 1, True)
  If rc <> 0 Or Not fso.FileExists(node) Then
    MsgBox "A preparacao falhou. Rode o app\PREPARAR.bat para ver o erro.", vbCritical, "Baixa Tudo"
    WScript.Quit
  End If
End If

sh.Run """" & node & """ """ & app & "\server.js"" --oculto --abrir", 0, False

' ---------- atalho na Area de Trabalho ----------
Const DESCRICAO = "Baixa Tudo - audio e video de varios sites"
Const DESCRICAO_ANTIGA = "Baixador de audio e video"
Dim lnkPath, lnk, antigo
lnkPath = sh.SpecialFolders("Desktop") & "\Baixa Tudo.lnk"

' atalho do nome antigo ("Baixador"): troca pelo novo
antigo = sh.SpecialFolders("Desktop") & "\Baixador.lnk"
If fso.FileExists(antigo) Then
  Set lnk = sh.CreateShortcut(antigo)
  If lnk.Description = DESCRICAO_ANTIGA Then
    fso.DeleteFile antigo
    If Not fso.FileExists(lnkPath) Then CriarAtalho
  End If
End If

If fso.FileExists(lnkPath) Then
  ' atalho nosso apontando para outro arquivo (pasta movida ou launcher antigo): atualiza
  Set lnk = sh.CreateShortcut(lnkPath)
  If lnk.Description = DESCRICAO And InStr(1, lnk.Arguments, WScript.ScriptFullName, vbTextCompare) = 0 Then CriarAtalho
ElseIf Not fso.FileExists(app & "\.sem-atalho") Then
  If MsgBox("Criar um atalho do Baixa Tudo na Area de Trabalho?" & vbCrLf & "Assim, nas proximas vezes, e so clicar no icone.", vbYesNo + vbQuestion, "Baixa Tudo") = vbYes Then
    CriarAtalho
  Else
    fso.CreateTextFile(app & "\.sem-atalho", True).Close
  End If
End If

Sub CriarAtalho
  Set lnk = sh.CreateShortcut(lnkPath)
  lnk.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
  lnk.Arguments = """" & WScript.ScriptFullName & """"
  lnk.WorkingDirectory = raiz
  If fso.FileExists(app & "\baixatudo.ico") Then lnk.IconLocation = app & "\baixatudo.ico,0"
  lnk.Description = DESCRICAO
  lnk.Save
End Sub

' ---------- migracao da versao com arquivos soltos na raiz ----------
' Leva para "app" o que e do usuario/maquina (configuracoes, executaveis ja baixados) e apaga
' da raiz os arquivos antigos do programa. Numa copia do git (raiz com .git) nao apaga nada:
' o "git pull" ja cuida dos arquivos versionados.
Sub MigrarVersaoAntiga
  Dim nome, ehGit
  On Error Resume Next
  ehGit = fso.FolderExists(raiz & "\.git")
  For Each nome In Array("config.json", ".sem-atalho")
    If fso.FileExists(raiz & "\" & nome) Then
      If fso.FileExists(app & "\" & nome) Then
        fso.DeleteFile raiz & "\" & nome, True
      Else
        fso.MoveFile raiz & "\" & nome, app & "\" & nome
      End If
    End If
  Next
  For Each nome In Array("bin", "runtime")
    If fso.FolderExists(raiz & "\" & nome) Then
      If Not fso.FolderExists(app & "\" & nome) Then
        fso.MoveFolder raiz & "\" & nome, app & "\" & nome
      ElseIf Not ehGit Then
        fso.DeleteFolder raiz & "\" & nome, True
      End If
    End If
  Next
  If Not ehGit Then
    For Each nome In Array("server.js", "conversor.js", "ui.html", "baixatudo.ico", "README.md", "PREPARAR.bat", "preparar.ps1", _
        "INICIAR BAIXA TUDO.bat", "DIAGNOSTICO (com janela).bat", "ABRIR BAIXA TUDO.vbs", "ABRIR BAIXADOR.vbs", "INICIAR BAIXADOR.bat", _
        "baixador.ico", "baixatudo.log", "baixador.log", ".gitignore", ".gitattributes")
      If fso.FileExists(raiz & "\" & nome) Then fso.DeleteFile raiz & "\" & nome, True
    Next
  End If
  On Error GoTo 0
End Sub

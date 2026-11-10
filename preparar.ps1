# Prepara esta maquina para rodar o Baixa Tudo: baixa para dentro da pasta do projeto
# o Node.js portatil (runtime\), o yt-dlp e o FFmpeg (bin\). Nada e instalado no Windows.
# Cada download e conferido pelo SHA-256 publicado pelo proprio projeto.
# Pode rodar de novo a qualquer momento: so baixa o que estiver faltando.
param([switch]$Forcar)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # sem isso o Invoke-WebRequest fica muito lento
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = $PSScriptRoot
$bin = Join-Path $raiz 'bin'
$rt  = Join-Path $raiz 'runtime'
$tmp = Join-Path $env:TEMP ('baixatudo-preparo-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $bin, $rt, $tmp | Out-Null

function Baixar($url, $destino) {
  Write-Host "    baixando $url"
  Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing -UserAgent 'baixa-tudo'
}
function ConferirHash($arquivo, $esperado) {
  $real = (Get-FileHash -Algorithm SHA256 -Path $arquivo).Hash
  if ($real -ne $esperado.ToUpper()) { throw "SHA-256 nao confere para $(Split-Path $arquivo -Leaf) (esperado $esperado, obtido $real)" }
  Write-Host '    SHA-256 conferido.'
}
function HashDaLista($textoLista, $nome) {
  foreach ($l in ($textoLista -split "`n")) {
    $p = $l.Trim() -split '\s+', 2
    if ($p.Count -eq 2 -and $p[1].TrimStart('*') -eq $nome) { return $p[0] }
  }
  throw "Nao achei o hash de $nome na lista publicada"
}
function Extrair($zip, $destino) {
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path $tar) { & $tar -xf $zip -C $destino; if ($LASTEXITCODE -ne 0) { throw "Falha ao extrair $zip" } }
  else { Expand-Archive -Path $zip -DestinationPath $destino -Force }
}

try {
  # ---------- Node.js (LTS 24) ----------
  $nodeExe = Join-Path $rt 'node.exe'
  if ($Forcar -or -not (Test-Path $nodeExe)) {
    Write-Host '[1/3] Node.js'
    $versoes = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $v = ($versoes | Where-Object { $_.lts -and $_.version -like 'v24.*' -and $_.files -contains 'win-x64-zip' } | Select-Object -First 1).version
    if (-not $v) { throw 'Nao encontrei uma versao LTS 24 do Node.js para Windows x64' }
    $nomeZip = "node-$v-win-x64.zip"
    $zip = Join-Path $tmp $nomeZip
    Baixar "https://nodejs.org/dist/$v/$nomeZip" $zip
    $somas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$v/SHASUMS256.txt" -UseBasicParsing).Content
    ConferirHash $zip (HashDaLista $somas $nomeZip)
    Extrair $zip (Join-Path $tmp 'node')
    Copy-Item (Join-Path $tmp "node\node-$v-win-x64\node.exe") $nodeExe -Force
    Write-Host "    Node $v pronto."
  } else { Write-Host '[1/3] Node.js ja existe.' }

  # ---------- yt-dlp ----------
  $ytdlp = Join-Path $bin 'yt-dlp.exe'
  if ($Forcar -or -not (Test-Path $ytdlp)) {
    Write-Host '[2/3] yt-dlp'
    $base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
    $novo = Join-Path $tmp 'yt-dlp.exe'
    Baixar "$base/yt-dlp.exe" $novo
    $somas = (Invoke-WebRequest -Uri "$base/SHA2-256SUMS" -UseBasicParsing).Content
    if ($somas -is [byte[]]) { $somas = [Text.Encoding]::UTF8.GetString($somas) }
    ConferirHash $novo (HashDaLista $somas 'yt-dlp.exe')
    Copy-Item $novo $ytdlp -Force
    Write-Host '    yt-dlp pronto.'
  } else { Write-Host '[2/3] yt-dlp ja existe.' }

  # ---------- FFmpeg (build do proprio projeto yt-dlp) ----------
  $ffmpeg = Join-Path $bin 'ffmpeg.exe'
  if ($Forcar -or -not (Test-Path $ffmpeg) -or -not (Test-Path (Join-Path $bin 'ffprobe.exe'))) {
    Write-Host '[3/3] FFmpeg (~90 MB)'
    $base = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest'
    $nomeZip = 'ffmpeg-master-latest-win64-gpl-shared.zip'
    $zip = Join-Path $tmp $nomeZip
    Baixar "$base/$nomeZip" $zip
    $somas = (Invoke-WebRequest -Uri "$base/checksums.sha256" -UseBasicParsing).Content
    if ($somas -is [byte[]]) { $somas = [Text.Encoding]::UTF8.GetString($somas) }
    ConferirHash $zip (HashDaLista $somas $nomeZip)
    Extrair $zip (Join-Path $tmp 'ff')
    $ffBin = Get-ChildItem -Path (Join-Path $tmp 'ff') -Directory | ForEach-Object { Join-Path $_.FullName 'bin' } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $ffBin) { throw 'Estrutura inesperada no ZIP do FFmpeg' }
    Get-ChildItem $ffBin | Where-Object { $_.Name -ne 'ffplay.exe' } | Copy-Item -Destination $bin -Force
    $lic = Get-ChildItem -Path (Join-Path $tmp 'ff') -Recurse -Filter 'LICENSE.txt' | Select-Object -First 1
    if ($lic) { Copy-Item $lic.FullName (Join-Path $bin 'FFMPEG-LICENSE.txt') -Force }
    Write-Host '    FFmpeg pronto.'
  } else { Write-Host '[3/3] FFmpeg ja existe.' }

  Write-Host ''
  Write-Host 'Tudo pronto. Abra o "ABRIR BAIXA TUDO.vbs".' -ForegroundColor Green
  exit 0
} catch {
  Write-Host ''
  Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Verifique a internet (em rede corporativa/VPN alguns downloads podem ser bloqueados) e rode de novo.'
  exit 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

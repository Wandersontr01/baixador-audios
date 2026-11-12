# Baixa Tudo

App local para baixar **audio ou video** do YouTube e de outros ~1.700 sites suportados pelo
yt-dlp (Instagram, TikTok, X/Twitter, Vimeo, Twitch, SoundCloud, Bandcamp, Internet Archive...).
A interface roda no navegador; o backend (Node) usa o **yt-dlp** e o **FFmpeg**. Tudo roda no seu PC.

> Conteudo com DRM (Netflix, Prime Video, Spotify, filmes da Globoplay/Disney/HBO etc.) **nao**
> e baixado. Itens que exigem login (privados, de membros, cursos) precisam da opcao
> "Usar cookies do navegador". A lista oficial de sites fica em `supportedsites.md` no repositorio
> yt-dlp/yt-dlp, ou rode `bin\yt-dlp.exe --list-extractors`.

## Instalar numa maquina nova

### Jeito mais facil: versao portatil (recomendado)

1. Abra a pagina de **Releases** do repositorio (logado na sua conta, o repo e privado):
   https://github.com/Wandersontr01/baixa-tudo/releases/latest
2. Baixe o **`BaixaTudo-portatil.zip`**. Ele ja vem com Node, yt-dlp e FFmpeg dentro.
3. Botao direito no ZIP > **Propriedades** > marque **Desbloquear** > OK (evita o aviso de
   seguranca do Windows ao abrir).
4. Extraia onde quiser (ex.: `Documentos\Baixa Tudo`) e abra o **`Baixa Tudo.vbs`**, o unico arquivo
   fora da pasta `app`.
5. Na primeira vez ele oferece criar um **atalho na Area de Trabalho**. Depois e so clicar no icone.

Nada e instalado no Windows e nao ha etapa de preparacao. A versao portatil e gerada
automaticamente pelo GitHub Actions (workflow `Versao portatil`) a cada tag `v*` enviada, ou
manualmente em **Actions > Versao portatil > Run workflow**.

### Para mexer no codigo: git clone (ou Code > Download ZIP)

Os executaveis **nao** ficam no git (o `avcodec` sozinho passa do limite de 100 MB do GitHub).
Nessa forma, a primeira abertura do `Baixa Tudo.vbs` pergunta e roda o `app\PREPARAR.bat`, que
baixa os executaveis para dentro da pasta.

```
git clone https://github.com/Wandersontr01/baixa-tudo.git
```

### O que o PREPARAR baixa (so na forma git/ZIP do codigo)

Na primeira abertura do **`Baixa Tudo.vbs`** ele pergunta e roda o **`app\PREPARAR.bat`**, que
baixa para dentro da pasta (nada e instalado no Windows):

| Pasta | Conteudo | Origem |
|---|---|---|
| `runtime\node.exe` | Node.js 24 LTS | nodejs.org |
| `bin\yt-dlp.exe` | Quem faz o download | GitHub yt-dlp/yt-dlp |
| `bin\ffmpeg.exe`, `ffprobe.exe` e `.dll` | Conversao e capa/titulo | GitHub yt-dlp/FFmpeg-Builds |

Cada download e conferido pelo SHA-256 publicado pelo proprio projeto. Para baixar tudo de novo:
`app\PREPARAR.bat -Forcar`.

### Atualizar para uma versao nova

- **Versao portatil:** baixe o ZIP da Release mais nova e extraia **por cima** da pasta atual
  (o atalho continua funcionando; `config.json` e mantido).
- **Com git:** `git pull` dentro da pasta.
- **Com ZIP:** baixe o ZIP de novo (desbloqueie, passo 3 acima) e extraia **por cima** da pasta
  atual, substituindo os arquivos. O ZIP nao traz `bin\`, `runtime\` nem `config.json`, entao os
  executaveis e suas configuracoes ficam como estao.

O yt-dlp se atualiza sozinho a cada 3 dias em qualquer das opcoes. `config.json` e `baixatudo.log`
sao por maquina e ficam fora do git.

> Em PCs corporativos, politicas de seguranca (AppLocker, antivirus) podem bloquear executaveis
> fora de `Arquivos de Programas`. Na primeira execucao o antivirus pode demorar para liberar o
> yt-dlp/FFmpeg; o app espera ate 3 minutos.

## Como usar

1. Duplo-clique em **`Baixa Tudo.vbs`** (ou no atalho). O servidor roda escondido (sem janela de prompt)
   e o navegador abre em http://localhost:3940.
   - Se ja estiver rodando, o duplo-clique so abre a pagina de novo.
   - Para encerrar: botao **Encerrar** no topo da pagina. Ele tambem se encerra sozinho 5 minutos
     depois que a pagina e fechada, se nada estiver baixando.
   - A saida do servidor fica em `baixatudo.log`.
   - O **`app\INICIAR BAIXA TUDO.bat`** faz o mesmo (pisca uma janela por meio segundo e fecha).
   - **`app\DIAGNOSTICO (com janela).bat`**: o mesmo app com a janela preta mostrando tudo, para
     investigar problemas.
2. Cole um ou mais links (um por linha), escolha o formato e clique em **Baixar audio**
   (ou use **Ctrl+Enter** no campo).
3. Enquanto voce cola, cada link aparece reconhecido com a plataforma (YouTube, Instagram,
   TikTok...). Links de sites com DRM (Spotify, Netflix...) e textos que nao sao links sao
   avisados e ignorados; sites fora da lista sao tentados pelo extrator generico do yt-dlp.
4. Acompanhe o progresso na lista. Use **Mostrar** para abrir o arquivo no Explorer e **Log** para
   ver a saida completa do yt-dlp quando algo falhar.

### Formatos

| Formato | O que e | Quando usar |
|---|---|---|
| **M4A** (padrao) | Audio AAC original do YouTube, sem recodificar | Melhor qualidade; toca em quase tudo |
| **MP3** | Recodificado a partir do original | So quando o aparelho exige MP3 |
| **OPUS** | Audio Opus original, sem recodificar | Arquivo menor, mesma qualidade |
| **OGG** | Vorbis, recodificado a partir do original | Quando o app/aparelho exige `.ogg` (Vorbis) |

> O YouTube entrega no maximo ~128 kbps AAC ou ~160 kbps Opus. Converter para MP3/OGG em bitrate alto nao
> aumenta a qualidade, so o tamanho do arquivo.

### Video

No topo do card **Adicionar**, alterne entre **🎵 Audio** e **🎬 Video**. No modo video:

| Opcao | O que faz |
|---|---|
| **MP4** (padrao) | Prefere H.264 + AAC, que toca direto em quase qualquer TV, celular e no Jellyfin sem conversao. No YouTube o H.264 vai ate 1080p; acima disso vem VP9/AV1 |
| **MKV** | Melhor qualidade disponivel (VP9/AV1/Opus), em container que aceita qualquer codec |
| **Resolucao maxima** | 480p a 4K, ou "a melhor disponivel". Se o video nao tiver essa resolucao, pega a maior abaixo dela |
| **Legendas (pt/en)** | Baixa e embute as legendas oficiais em portugues/ingles, quando o video tiver (nao inclui as automaticas) |

Video e audio vem separados do YouTube e o FFmpeg junta os dois no final (status "Convertendo").
Os videos vao para uma pasta propria (**Pasta onde os videos sao salvos**, padrao
`Videos\Baixa Tudo`), separada das musicas. Capitulos, titulo e capa sao gravados no arquivo.

### Converter audio

Aba **Converter audio**: arraste arquivos de audio ou video (ate 30 por vez) ou clique para
escolher, e selecione o formato de saida: **MP3, M4A (AAC), OPUS, OGG, FLAC ou WAV**. Os arquivos
convertidos vao para a **Pasta das conversoes** (padrao: `Convertidos` dentro da pasta dos audios).

- **Rapido:** uma musica de 4 min leva de 1 a 5 s; varias conversoes rodam em paralelo
  (ate 3, conforme os nucleos do processador).
- **Sem reconversao quando possivel:** se o audio ja esta no codec escolhido (ex.: AAC -> M4A,
  MP3 -> MP3), ele so e copiado: instantaneo e sem perda (etiqueta "sem reconversao").
- **Video de entrada** (MP4, MKV, WEBM...): extrai a faixa de audio.
- Mantem titulo/artista/album e, em MP3, M4A e FLAC, a capa.
- Conversao entre formatos com perda (MP3, AAC, OPUS, OGG) recebe a etiqueta "com perda":
  perde um pouco de qualidade, e subir o bitrate nao recupera o que ja foi perdido.

### Configuracoes

- **Pastas de saida**: audios em `Musicas\Baixa Tudo` e videos em `Videos\Baixa Tudo` (padrao). O botao **Escolher...** abre o
  seletor do Windows (ele pode aparecer atras do navegador).
- **Pular ja baixados**: guarda um registro em `.baixados-<formato>.txt` dentro da pasta de saida,
  para nao baixar de novo o mesmo video no mesmo formato.
- **Playlists**: ao colar um link de playlist (YouTube ou YouTube Music), abre uma lista com as
  faixas para voce marcar quais quer. Shift+clique marca um intervalo; faixas ja baixadas aparecem
  marcadas como "ja baixada". As faixas vao para uma subpasta com o nome da playlist, numeradas
  pela posicao (`003 - Titulo [id].m4a`).
  - Com a opcao **Link de playlist: escolher as faixas** desmarcada, um link de video que esta
    dentro de uma playlist (`watch?v=...&list=...`) baixa so aquele video. Links que sao so de
    playlist sempre abrem a lista.
- **Limite de 30 faixas por envio**, tanto nos links colados quanto na selecao da playlist. Para
  mais, baixe em partes.
- **Usar cookies do navegador**: so e necessario para videos com restricao de idade, exclusivos
  para membros, ou quando o YouTube responder *"Sign in to confirm you're not a bot"*. O Chrome e o
  Edge bloqueiam o arquivo de cookies enquanto estao abertos, entao o **Firefox** e a opcao mais
  pratica.

### Botao na barra de favoritos

Na secao **Configuracoes**, arraste o botao **🎧 Baixar audio** para a barra de favoritos. Em
qualquer video do YouTube, clique nele: o Baixa Tudo abre e coloca aquele video na fila usando o
formato atual. O servidor precisa estar rodando.

## Quando der erro

1. Clique em **Atualizar yt-dlp** e tente de novo. A maioria das falhas acontece porque o YouTube
   mudou algo e o yt-dlp ja foi corrigido.
2. Se aparecer pedido de login/verificacao, ative **Usar cookies do navegador**.
3. Veja o **Log** do item: ele mostra o comando exato e a saida do yt-dlp.

Se o antivirus apagar `bin\yt-dlp.exe`, adicione uma excecao para a pasta `bin` e clique em
**Tentar de novo** no aviso.

## Arquivos

```
Baixa Tudo\
  Baixa Tudo.vbs                 <- o unico arquivo para executar
  app\                           <- todo o resto
    server.js                    servidor local, fila de downloads, chamadas ao yt-dlp
    conversor.js                 conversao de audio (FFmpeg), fila em paralelo
    ui.html                      interface
    baixatudo.ico                icone do atalho
    INICIAR BAIXA TUDO.bat       mesmo que o .vbs (se o VBScript estiver desativado)
    DIAGNOSTICO (com janela).bat inicia com a janela de prompt visivel
    PREPARAR.bat / preparar.ps1  baixa os executaveis (so na forma git)
    bin\                         yt-dlp, FFmpeg e FFprobe
    runtime\                     Node.js portatil
    config.json, baixatudo.log   suas preferencias e o log (por maquina)
```

Ao extrair uma versao nova por cima de uma pasta antiga (arquivos soltos na raiz), o
`Baixa Tudo.vbs` move configuracoes e executaveis para `app` e limpa a raiz sozinho.

Uso pessoal: baixar conteudo do YouTube vai contra os Termos de Servico da plataforma, exceto
quando o conteudo e seu ou tem licenca que permita.

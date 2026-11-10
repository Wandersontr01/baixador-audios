# Baixador de Audio e Video

App local para baixar **audio ou video** do YouTube e de outros ~1.700 sites suportados pelo
yt-dlp (Instagram, TikTok, X/Twitter, Vimeo, Twitch, SoundCloud, Bandcamp, Internet Archive...).
A interface roda no navegador; o backend (Node) usa o **yt-dlp** e o **FFmpeg**. Tudo roda no seu PC.

> Conteudo com DRM (Netflix, Prime Video, Spotify, filmes da Globoplay/Disney/HBO etc.) **nao**
> e baixado. Itens que exigem login (privados, de membros, cursos) precisam da opcao
> "Usar cookies do navegador". A lista oficial de sites fica em `supportedsites.md` no repositorio
> yt-dlp/yt-dlp, ou rode `bin\yt-dlp.exe --list-extractors`.

## Instalar numa maquina nova

Repositorio pessoal e privado. Os executaveis **nao** ficam no git (o `avcodec` sozinho passa do
limite de 100 MB do GitHub); cada maquina baixa os seus na primeira vez.

### 1. Pegar o codigo (escolha um)

**Opcao A - Download do ZIP** (mais simples, para maquinas onde voce so vai usar o app)

1. Abra https://github.com/Wandersontr01/baixador-audios **logado na sua conta** (repo privado).
2. Clique em **Code > Download ZIP**.
3. **Antes de extrair:** botao direito no ZIP > **Propriedades** > marque **Desbloquear** > OK.
   Sem isso o Windows marca os arquivos como "vindos da internet" e mostra um aviso de seguranca
   ao abrir o `.vbs`/`.bat` (se esquecer, e so confirmar o aviso).
4. Extraia. A pasta vem como `baixador-audios-main`; pode renomear e colocar onde quiser.

**Opcao B - git clone** (para a maquina onde voce mexe no codigo, ou para atualizar com um comando)

```
git clone https://github.com/Wandersontr01/baixador-audios.git
```

### 2. Primeira execucao

Abra o **`ABRIR BAIXADOR.vbs`**: na primeira vez ele pergunta e roda o **`PREPARAR.bat`**, que
baixa para dentro da pasta (nada e instalado no Windows):

| Pasta | Conteudo | Origem |
|---|---|---|
| `runtime\node.exe` | Node.js 24 LTS | nodejs.org |
| `bin\yt-dlp.exe` | Quem faz o download | GitHub yt-dlp/yt-dlp |
| `bin\ffmpeg.exe`, `ffprobe.exe` e `.dll` | Conversao e capa/titulo | GitHub yt-dlp/FFmpeg-Builds |

Cada download e conferido pelo SHA-256 publicado pelo proprio projeto. Para baixar tudo de novo:
`PREPARAR.bat -Forcar`.

### 3. Atualizar para uma versao nova do codigo

- **Com git:** `git pull` dentro da pasta.
- **Com ZIP:** baixe o ZIP de novo (desbloqueie, passo 3 acima) e extraia **por cima** da pasta
  atual, substituindo os arquivos. O ZIP nao traz `bin\`, `runtime\` nem `config.json`, entao os
  executaveis e suas configuracoes ficam como estao.

O yt-dlp se atualiza sozinho a cada 3 dias em qualquer das opcoes. `config.json` e `baixador.log`
sao por maquina e ficam fora do git.

> Em PCs corporativos, politicas de seguranca (AppLocker, antivirus) podem bloquear executaveis
> fora de `Arquivos de Programas`. Na primeira execucao o antivirus pode demorar para liberar o
> yt-dlp/FFmpeg; o app espera ate 3 minutos.

## Como usar

1. Duplo-clique em **`ABRIR BAIXADOR.vbs`**. O servidor roda escondido (sem janela de prompt)
   e o navegador abre em http://localhost:3940.
   - Se ja estiver rodando, o duplo-clique so abre a pagina de novo.
   - Para encerrar: botao **Encerrar** no topo da pagina. Ele tambem se encerra sozinho 5 minutos
     depois que a pagina e fechada, se nada estiver baixando.
   - A saida do servidor fica em `baixador.log`.
   - O **`INICIAR BAIXADOR.bat`** faz o mesmo (pisca uma janela por meio segundo e fecha).
   - **`DIAGNOSTICO (com janela).bat`**: o mesmo app com a janela preta mostrando tudo, para
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
`Videos\Baixador`), separada das musicas. Capitulos, titulo e capa sao gravados no arquivo.

### Configuracoes

- **Pastas de saida**: audios em `Musicas\Baixador de Audios` e videos em `Videos\Baixador` (padrao). O botao **Escolher...** abre o
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
qualquer video do YouTube, clique nele: o Baixador abre e coloca aquele video na fila usando o
formato atual. O servidor precisa estar rodando.

## Quando der erro

1. Clique em **Atualizar yt-dlp** e tente de novo. A maioria das falhas acontece porque o YouTube
   mudou algo e o yt-dlp ja foi corrigido.
2. Se aparecer pedido de login/verificacao, ative **Usar cookies do navegador**.
3. Veja o **Log** do item: ele mostra o comando exato e a saida do yt-dlp.

Se o antivirus apagar `bin\yt-dlp.exe`, adicione uma excecao para a pasta `bin` e clique em
**Tentar de novo** no aviso.

## Arquivos

| Arquivo | Funcao |
|---|---|
| `ABRIR BAIXADOR.vbs` | Inicia sem janela e abre o navegador |
| `INICIAR BAIXADOR.bat` | Mesmo que o .vbs (alternativa se o VBScript estiver desativado) |
| `DIAGNOSTICO (com janela).bat` | Inicia com a janela de prompt visivel |
| `server.js` | Servidor local, fila de downloads e chamadas ao yt-dlp |
| `ui.html` | Interface |
| `config.json` | Suas preferencias (criado ao salvar) |
| `runtime/` | Node.js portatil (baixado pelo PREPARAR, fora do git) |
| `PREPARAR.bat` / `preparar.ps1` | Baixa os executaveis numa maquina nova |
| `bin/` | yt-dlp, FFmpeg e FFprobe (baixados pelo PREPARAR, fora do git) |

Uso pessoal: baixar conteudo do YouTube vai contra os Termos de Servico da plataforma, exceto
quando o conteudo e seu ou tem licenca que permita.

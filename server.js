/**
 * Baixa Tudo — app local (Node + navegador), portatil.
 * Sobe um servidor em http://localhost:PORT, serve a interface e usa o yt-dlp
 * para baixar somente o audio.
 *
 * Tudo vem na pasta: runtime/node.exe, bin/yt-dlp.exe e bin/ffmpeg.exe + ffprobe.exe.
 * Se faltar o yt-dlp, ele e baixado de novo; o FFmpeg tambem e procurado no PATH.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = 3940;
const APP_DIR = __dirname;
const BIN_DIR = path.join(APP_DIR, 'bin');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const IS_WIN = process.platform === 'win32';
const exe = n => (IS_WIN ? n + '.exe' : n);

const YTDLP = path.join(BIN_DIR, exe('yt-dlp'));
const YTDLP_ASSET = IS_WIN ? 'yt-dlp.exe' : (process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + YTDLP_ASSET;
const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);

// --oculto: iniciado pelo ABRIR BAIXA TUDO.vbs, sem janela. Saida vai para baixatudo.log
// e o servidor se encerra sozinho quando a pagina fica fechada e nada esta baixando.
// --abrir: abre o navegador ao iniciar (ou, se ja estiver rodando, so abre a pagina).
const OCULTO = process.argv.includes('--oculto');
const ABRIR = process.argv.includes('--abrir');
const ENCERRAR_APOS_MS = 5 * 60 * 1000;
if (OCULTO) {
  const LOG_FILE = path.join(APP_DIR, 'baixatudo.log');
  try { if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) fs.unlinkSync(LOG_FILE); } catch (e) {}
  const gravar = (...a) => { try { fs.appendFileSync(LOG_FILE, new Date().toLocaleString('pt-BR') + '  ' + a.join(' ') + '\n'); } catch (e) {} };
  console.log = gravar; console.error = gravar;
}
function abrirNavegador() {
  const alvo = 'http://localhost:' + PORT;
  if (IS_WIN) spawn('explorer.exe', [alvo], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [alvo], { detached: true, stdio: 'ignore' }).unref();
}
let ultimoAcesso = Date.now();

// ---------- configuracao ----------
const DEFAULT_CFG = {
  tipo: 'audio',           // audio | video (o que a tela abre selecionado)
  pastaSaida: path.join(os.homedir(), 'Music', 'Baixa Tudo'),
  formato: 'm4a',          // audio: m4a | mp3 | opus | ogg
  qualidadeMp3: '192',     // kbps (MP3/OGG)
  pastaVideos: path.join(os.homedir(), 'Videos', 'Baixa Tudo'),
  formatoVideo: 'mp4',     // video: mp4 (compativel) | mkv (maxima qualidade)
  resolucao: '1080',       // 480 | 720 | 1080 | 1440 | 2160 | melhor
  legendas: false,         // baixar e embutir legendas oficiais (pt/en)
  pularBaixados: true,
  cookiesNavegador: ''     // '' | firefox | edge | chrome | brave
};
function lerConfig() {
  try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch (e) { return { ...DEFAULT_CFG }; }
}
function salvarConfig(c) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), 'utf8'); }
let config = lerConfig();

// ---------- estado das ferramentas ----------
const setup = {
  ytdlp: 'verificando',    // verificando | baixando | ok | erro
  ytdlpVersao: '',
  ytdlpPct: 0,
  ytdlpErro: '',
  atualizando: false,
  ffmpeg: null,            // caminho do ffmpeg ou null
  ffmpegInstalando: false,
  ffmpegMsg: '',
  nodeVersao: process.versions.node,
  nodeAntigo: NODE_MAJOR < 20
};

function rodar(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: opts.timeout || 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

function baixarArquivo(u, destino, onProg, redir = 0) {
  return new Promise((resolve, reject) => {
    https.get(u, { headers: { 'User-Agent': 'baixa-tudo' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        if (redir > 8) return reject(new Error('Redirecionamentos demais'));
        return baixarArquivo(new URL(r.headers.location, u).toString(), destino, onProg, redir + 1).then(resolve, reject);
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode + ' ao baixar ' + u)); }
      const total = +r.headers['content-length'] || 0;
      let recebido = 0;
      const tmp = destino + '.part';
      const f = fs.createWriteStream(tmp);
      r.on('data', c => { recebido += c.length; if (onProg && total) onProg(recebido / total); });
      r.on('error', reject);
      f.on('error', reject);
      f.on('finish', () => f.close(() => {
        try {
          fs.renameSync(tmp, destino);
          if (!IS_WIN) fs.chmodSync(destino, 0o755);
          resolve();
        } catch (e) { reject(e); }
      }));
      r.pipe(f);
    }).on('error', reject);
  });
}

// Texto do erro real do Windows (codigo + mensagem) para diagnosticar bloqueios
function descreverErro(r) {
  const e = r.err; if (!e) return '';
  if (e.killed && e.signal) return 'tempo esgotado (o antivirus pode estar examinando o arquivo na primeira execucao; clique em verificar de novo em alguns segundos)';
  const partes = [];
  if (e.code !== undefined) {
    const n = typeof e.code === 'number' ? e.code : null;
    partes.push('codigo ' + e.code + (n !== null && n > 0x7fffffff ? ' (0x' + n.toString(16).toUpperCase() + ')' : ''));
  }
  if (e.errno !== undefined && e.errno !== e.code) partes.push('errno ' + e.errno);
  if (e.signal) partes.push('sinal ' + e.signal);
  const saida = (r.stderr || r.stdout || '').trim().split(/\r?\n/).slice(-3).join(' | ');
  return partes.join(', ') + (saida ? ' — ' + saida : (e.message ? ' — ' + e.message : ''));
}

let ultimoErroYtdlp = '';
async function versaoYtdlp() {
  // primeira execucao pode demorar: o antivirus examina o executavel antes de liberar
  const r = await rodar(YTDLP, ['--version'], { timeout: 180000 });
  ultimoErroYtdlp = descreverErro(r);
  return r.err ? '' : r.stdout.trim();
}

async function prepararYtdlp(forcar = false) {
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    if (forcar || !fs.existsSync(YTDLP)) {
      setup.ytdlp = 'baixando'; setup.ytdlpPct = 0; setup.ytdlpErro = '';
      console.log('Baixando yt-dlp de ' + YTDLP_URL + ' ...');
      await baixarArquivo(YTDLP_URL, YTDLP, p => { setup.ytdlpPct = Math.round(p * 100); });
    }
    const v = await versaoYtdlp();
    if (!v) throw new Error('O Windows nao deixou executar bin\\' + exe('yt-dlp') + '. Erro: ' + (ultimoErroYtdlp || 'desconhecido'));
    setup.ytdlp = 'ok'; setup.ytdlpVersao = v;
    console.log('yt-dlp ' + v + ' pronto.');
    // atualiza sozinho se o executavel tem mais de 3 dias
    const idadeDias = (Date.now() - fs.statSync(YTDLP).mtimeMs) / 86400000;
    if (!forcar && idadeDias > 3) atualizarYtdlp().catch(() => {});
  } catch (e) {
    setup.ytdlp = 'erro'; setup.ytdlpErro = e.message;
    console.log('[ERRO] yt-dlp: ' + e.message);
  }
}

async function atualizarYtdlp() {
  if (setup.atualizando) return { ok: false, saida: 'Atualizacao ja em andamento.' };
  if (jobAtivo) return { ok: false, saida: 'Espere os downloads em andamento terminarem para atualizar.' };
  setup.atualizando = true;
  try {
    const r = await rodar(YTDLP, ['-U'], { timeout: 180000 });
    // touch para nao atualizar de novo a cada inicio quando ja esta na ultima versao
    try { const t = new Date(); fs.utimesSync(YTDLP, t, t); } catch (e) {}
    setup.ytdlpVersao = (await versaoYtdlp()) || setup.ytdlpVersao;
    return { ok: !r.err, saida: (r.stdout + '\n' + r.stderr).trim() };
  } finally { setup.atualizando = false; }
}

// No Windows, um FFmpeg instalado com o servidor ja aberto nao aparece no PATH
// deste processo; relemos o PATH do registro antes de procurar.
async function recarregarPathWindows() {
  if (!IS_WIN) return;
  const r = await rodar('powershell', ['-NoProfile', '-Command',
    "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"]);
  if (!r.err && r.stdout.trim()) process.env.Path = r.stdout.trim();
}

async function acharFfmpeg() {
  await recarregarPathWindows();
  const candidatos = [path.join(BIN_DIR, exe('ffmpeg'))];
  if (IS_WIN && process.env.LOCALAPPDATA) candidatos.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
  candidatos.push('ffmpeg');
  for (const c of candidatos) {
    if (c !== 'ffmpeg' && !fs.existsSync(c)) continue;
    const r = await rodar(c, ['-version'], { timeout: 180000 });
    if (!r.err) { setup.ffmpeg = c; return c; }
    if (c !== 'ffmpeg' && !setup.ffmpegInstalando) setup.ffmpegMsg = 'O Windows nao deixou executar ' + c + '. Erro: ' + descreverErro(r);
  }
  setup.ffmpeg = null;
  return null;
}

async function instalarFfmpeg() {
  if (!IS_WIN) return { ok: false, msg: 'Instalacao automatica so no Windows. Instale o ffmpeg pelo gerenciador de pacotes do sistema.' };
  if (setup.ffmpegInstalando) return { ok: false, msg: 'Instalacao ja em andamento.' };
  setup.ffmpegInstalando = true; setup.ffmpegMsg = 'Instalando FFmpeg via winget (pode levar alguns minutos)...';
  try {
    const r = await rodar('winget', ['install', '-e', '--id', 'Gyan.FFmpeg', '--accept-source-agreements', '--accept-package-agreements'], { timeout: 900000 });
    const achou = await acharFfmpeg();
    setup.ffmpegMsg = achou ? 'FFmpeg instalado.' : ('Nao foi possivel instalar automaticamente. ' + (r.stderr || r.stdout || (r.err && r.err.message) || '').trim().slice(-400));
    return { ok: !!achou, msg: setup.ffmpegMsg };
  } finally { setup.ffmpegInstalando = false; }
}

// ---------- fila de downloads ----------
const jobs = [];
let seq = 0;
let jobAtivo = null;

const MAX_POR_ENVIO = 30;   // limite de faixas por envio (links colados ou faixas de playlist)
const MAX_LISTAGEM = 500;   // quantas faixas de uma playlist sao lidas para a lista de selecao

// Nome de pasta seguro no Windows (para a subpasta da playlist)
function nomePastaSeguro(s) {
  const n = String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return n.slice(0, 100) || 'Playlist';
}

const FORMATOS = { audio: ['m4a', 'mp3', 'opus', 'ogg'], video: ['mp4', 'mkv'] };
const QUALIDADES = { audio: ['128', '192', '256', '320'], video: ['480', '720', '1080', '1440', '2160', 'melhor'] };

// Pasta final e arquivo de "ja baixados" de cada tipo/formato
const pastaDestino = tipo => (tipo === 'video' ? config.pastaVideos : config.pastaSaida);
const arquivoBaixados = (tipo, formato) =>
  path.join(pastaDestino(tipo), '.baixados-' + (tipo === 'video' ? 'video-' : '') + formato + '.txt');

function novoJob(u, opts) {
  return {
    id: ++seq, url: u,
    tipo: opts.tipo === 'video' ? 'video' : 'audio',
    formato: opts.formato, qualidade: opts.qualidade, legendas: !!opts.legendas,
    // faixa escolhida de uma playlist: vai para subpasta propria, numerada pela posicao
    subpasta: opts.subpasta ? nomePastaSeguro(opts.subpasta) : '',
    indice: Number.isInteger(opts.indice) && opts.indice > 0 ? opts.indice : 0,
    status: 'fila', titulo: opts.titulo ? String(opts.titulo).slice(0, 300) : '', pct: 0, vel: '', eta: '',
    extrator: '', thumb: '',
    arquivos: [], erros: [], log: [], dica: '', criadoEm: Date.now(), proc: null, cancelado: false
  };
}

// O yt-dlp trabalha numa pasta de preparo propria de cada download e o servidor move so o
// arquivo final para a pasta de saida. Se ele usasse a pasta de saida direto, um M4A ja salvo
// do mesmo video seria reaproveitado como "original" da conversao para MP3 e depois apagado.
const pastaPreparo = j => path.join(os.tmpdir(), 'baixa-tudo', process.pid + '-' + j.id);

function moverArquivo(origem, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try { fs.renameSync(origem, destino); }
  catch (e) {
    if (e.code !== 'EXDEV' && e.code !== 'EPERM') throw e;
    fs.copyFileSync(origem, destino);   // pastas em discos diferentes
    fs.unlinkSync(origem);
  }
}

function modeloSaida(j) {
  const base = '%(title)s [%(id)s].%(ext)s';
  if (!j.subpasta) return base;
  const pasta = j.subpasta.replace(/%/g, '%%');   // '%' literal no modelo do yt-dlp
  return pasta + '/' + (j.indice ? String(j.indice).padStart(3, '0') + ' - ' : '') + base;
}

function argsComuns() {
  const a = ['--encoding', 'utf-8', '--no-colors', '--js-runtimes', 'node:' + process.execPath];
  if (config.cookiesNavegador) a.push('--cookies-from-browser', config.cookiesNavegador);
  return a;
}

// Le as faixas de uma playlist sem baixar nada (so titulos/ids)
async function listarPlaylist(u, tipo, formato) {
  const r = await rodar(YTDLP, [...argsComuns(), '--flat-playlist', '-J', '--yes-playlist', '--no-warnings',
    '--playlist-end', String(MAX_LISTAGEM), '--', u], { timeout: 240000 });
  if (r.err && !r.stdout.trim()) {
    const msg = (r.stderr.split(/\r?\n/).filter(l => l.startsWith('ERROR:')).pop() || descreverErro(r)).replace(/^ERROR:\s*/, '');
    const e = new Error(msg); e.dica = dicaPara(msg); throw e;
  }
  const d = JSON.parse(r.stdout);
  if (d._type !== 'playlist' || !Array.isArray(d.entries))
    return { titulo: d.title || '', ehPlaylist: false, itens: [] };

  let arquivo = new Set();
  try {
    const txt = fs.readFileSync(arquivoBaixados(tipo, formato), 'utf8');
    arquivo = new Set(txt.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean));
  } catch (e) {}

  const itens = d.entries.filter(Boolean).map((e, i) => {
    const t = e.title || '';
    const indisponivel = e._type === 'playlist' || /^\[(private|deleted|unavailable)/i.test(t);
    const chave = ((e.ie_key || e.extractor_key || '') + ' ' + e.id).toLowerCase();
    let link = e.url || e.webpage_url || '';
    if (!/^https?:/i.test(link) && e.id && /youtube/i.test(e.ie_key || '')) link = 'https://www.youtube.com/watch?v=' + e.id;
    return {
      indice: e.playlist_index || i + 1, id: e.id, titulo: t || e.id, url: link,
      canal: e.channel || e.uploader || '', duracao: e.duration || null,
      jaBaixado: arquivo.has(chave), indisponivel: indisponivel || !/^https?:/i.test(link)
    };
  });
  return { titulo: d.title || 'Playlist', ehPlaylist: true, total: d.playlist_count || itens.length, truncado: itens.length >= MAX_LISTAGEM, itens };
}

function montarArgs(j) {
  const a = [
    ...argsComuns(), '--newline', '--no-mtime', '--ignore-errors',
    '-P', pastaPreparo(j),
    '-o', modeloSaida(j),
    // cada item da fila e UM video; --max-downloads e a trava caso o link seja de playlist/canal
    '--no-playlist', '--max-downloads', '1',
    '--print', 'before_dl:INFO|%(extractor_key)s|%(thumbnail|)s',
    '--print', 'before_dl:TITLE|%(title)s',
    '--print', 'after_move:FILE|%(filepath)s',
    '--no-simulate', '--progress',
    '--progress-template', 'download:PROG|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--progress-template', 'postprocess:POST|%(progress.postprocessor)s'
  ];
  const ff = setup.ffmpeg;
  // passa a PASTA (e nao o ffmpeg.exe) para o yt-dlp achar tambem o ffprobe.exe ao lado
  if (ff && ff !== 'ffmpeg') a.push('--ffmpeg-location', path.dirname(ff));

  if (j.tipo === 'video') {
    // Video e audio vem em streams separados e o FFmpeg junta (merge) no final.
    // Filtros explicitos em vez de ordenacao (-S) para o resultado ser previsivel:
    //  - MP4 "compativel": prefere H.264 + AAC, que toca em praticamente qualquer TV/celular sem o
    //    servidor precisar converter. No YouTube o H.264 vai ate 1080p; acima disso cai para VP9/AV1.
    //  - MKV: melhor qualidade disponivel (VP9/AV1/Opus), container que aceita qualquer codec.
    const alt = j.qualidade === 'melhor' ? '' : '[height<=' + j.qualidade + ']';
    if (j.formato === 'mp4') {
      a.push('-f', [
        'bv*' + alt + "[vcodec~='^(avc|h264)']+ba[acodec~='^(mp4a|aac)']",
        'bv*' + alt + "[vcodec~='^(avc|h264)']+ba",
        'bv*' + alt + '+ba',
        'b' + alt, 'b'
      ].join('/'), '--merge-output-format', 'mp4');
    } else {
      a.push('-f', ['bv*' + alt + '+ba', 'b' + alt, 'b'].join('/'), '--merge-output-format', 'mkv');
    }
    a.push('--embed-chapters');
    if (j.legendas) a.push('--write-subs', '--sub-langs', 'pt.*,en.*', '--embed-subs');
  } else if (j.formato === 'mp3') {
    a.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', (j.qualidade || '192') + 'K');
  } else if (j.formato === 'ogg') {
    // OGG Vorbis: o YouTube nao tem Vorbis, entao e recodificado (como o MP3).
    // Usa qualidade variavel (-q:a), e nao bitrate fixo: o libvorbis recusa bitrates altos em
    // audio mono (ex.: 320k). No yt-dlp, --audio-quality N vira -q:a (10 - N) para Vorbis.
    const qVorbis = { '128': 4, '192': 6, '256': 8, '320': 9 }[j.qualidade] || 6;
    a.push('-f', 'bestaudio/best', '-x', '--audio-format', 'vorbis', '--audio-quality', String(10 - qVorbis));
  } else if (j.formato === 'opus') {
    a.push('-f', 'bestaudio[acodec=opus]/bestaudio/best', '-x', '--audio-format', 'opus');
  } else {
    a.push('-f', 'bestaudio[ext=m4a]/bestaudio/best');
  }
  if (ff) a.push('--embed-metadata', '--embed-thumbnail');
  if (config.pularBaixados) a.push('--download-archive', arquivoBaixados(j.tipo, j.formato));
  a.push('--', j.url);
  return a;
}

function dicaPara(texto) {
  const t = texto.toLowerCase();
  if (t.includes('not a bot') || t.includes('sign in to confirm')) return 'O YouTube pediu login/verificacao. Em Configuracoes, escolha um navegador em "Usar cookies do navegador" (Firefox funciona melhor) e tente de novo.';
  if (t.includes('private video') || t.includes('members-only') || t.includes('join this channel')) return 'Video privado ou exclusivo para membros: precisa dos cookies de uma conta com acesso.';
  if (t.includes('confirm your age') || t.includes('age-restricted') || t.includes('inappropriate for some users')) return 'Video com restricao de idade: use "Usar cookies do navegador" com uma conta logada.';
  if (t.includes('unable to connect') || t.includes('getaddrinfo') || t.includes('timed out') || t.includes('connection reset') || t.includes('proxy')) return 'Falha de conexao. Verifique a internet; em rede corporativa/VPN o YouTube pode estar bloqueado.';
  if (t.includes('video unavailable') || t.includes('this video is not available')) return 'Video indisponivel (removido, privado ou bloqueado na sua regiao).';
  if (t.includes('ffmpeg') || t.includes('ffprobe')) return 'Este formato precisa do FFmpeg. Instale-o em Configuracoes ou escolha M4A.';
  if (t.includes('js runtime') || t.includes('javascript runtime') || t.includes('n challenge') || t.includes('signature')) return 'Falha ao resolver o desafio do player. Clique em "Atualizar yt-dlp" e tente de novo' + (setup.nodeAntigo ? ' (e atualize o Node.js para a versao LTS atual).' : '.');
  if (t.includes('http error 403')) return 'Acesso negado pelo servidor. Atualize o yt-dlp; se persistir, use cookies do navegador.';
  if (t.includes('could not copy') && t.includes('cookie')) return 'Nao consegui ler os cookies: feche o navegador escolhido (Chrome/Edge bloqueiam o arquivo) ou use o Firefox.';
  return '';
}

function registrar(j, linha) {
  j.log.push(linha);
  if (j.log.length > 200) j.log.splice(0, j.log.length - 200);
}

function executar(j) {
  jobAtivo = j;
  j.status = 'baixando';
  try { fs.mkdirSync(pastaDestino(j.tipo), { recursive: true }); }
  catch (e) { j.status = 'erro'; j.erros.push('Nao foi possivel criar a pasta de saida: ' + e.message); jobAtivo = null; return proximo(); }

  const args = montarArgs(j);
  const p = spawn(YTDLP, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  j.proc = p;

  const tratar = (buf, origem) => {
    for (const linha of buf.toString('utf8').split(/\r?\n/)) {
      const l = linha.trim();
      if (!l) continue;
      if (l.startsWith('PROG|')) {
        const [, pct, vel, eta] = l.split('|');
        j.pct = parseFloat(pct) || 0; j.vel = (vel || '').trim(); j.eta = (eta || '').trim();
        if (j.status !== 'baixando') j.status = 'baixando';
        continue;
      }
      if (l.startsWith('POST|')) { j.status = 'convertendo'; j.pct = 100; continue; }
      if (l.startsWith('INFO|')) {
        // plataforma que o yt-dlp reconheceu de fato (ex.: Youtube, Instagram, Generic) e miniatura
        const [, extrator, ...thumb] = l.split('|');
        j.extrator = extrator || '';
        const t = thumb.join('|');
        if (/^https?:\/\//i.test(t)) j.thumb = t;
        continue;
      }
      if (l.startsWith('TITLE|')) { j.titulo = l.slice(6); j.pct = 0; continue; }
      if (l.startsWith('FILE|')) {
        const origem = l.slice(5);
        const destino = path.join(pastaDestino(j.tipo), path.relative(pastaPreparo(j), origem));
        try { moverArquivo(origem, destino); j.arquivos.push(destino); }
        catch (e) { j.erros.push('Baixado, mas nao consegui mover para a pasta de saida: ' + e.message + ' (arquivo em ' + origem + ')'); }
        continue;
      }
      registrar(j, l);
      if (l.startsWith('ERROR:')) {
        j.erros.push(l.slice(6).trim());
        const d = dicaPara(l); if (d && !j.dica) j.dica = d;
      }
    }
  };
  p.stdout.on('data', b => tratar(b, 'out'));
  p.stderr.on('data', b => tratar(b, 'err'));
  p.on('error', e => { j.erros.push('Falha ao iniciar o yt-dlp: ' + e.message); });
  p.on('close', code => {
    j.proc = null;
    // apaga a pasta de preparo (sobras de cancelamento/erro); um pouco depois no Windows,
    // porque o taskkill pode ainda estar liberando os arquivos
    setTimeout(() => { try { fs.rmSync(pastaPreparo(j), { recursive: true, force: true }); } catch (e) {} }, 1500);
    if (j.cancelado) j.status = 'cancelado';
    else if (j.arquivos.length && j.erros.length) j.status = 'parcial';
    else if (j.arquivos.length) j.status = 'concluido';
    else if (j.erros.length || (code !== 0 && code !== 101)) j.status = 'erro';
    else j.status = 'pulado';
    if (j.status === 'erro' && !j.erros.length) j.erros.push('yt-dlp terminou com codigo ' + code + '. Veja o log.');
    jobAtivo = null;
    proximo();
  });
}

function proximo() {
  if (jobAtivo || setup.ytdlp !== 'ok' || setup.atualizando) return;
  const j = jobs.find(x => x.status === 'fila');
  if (j) executar(j);
}
setInterval(proximo, 1000);

function matarArvore(p) {
  if (!p) return;
  if (IS_WIN) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
  else p.kill('SIGTERM');
}

function jobPublico(j) {
  const { proc, ...resto } = j;
  return { ...resto, log: undefined, arquivos: j.arquivos.map(f => path.basename(f)) };
}

function abrirNoExplorer(alvo, selecionar) {
  if (IS_WIN) spawn('explorer.exe', selecionar ? ['/select,', alvo] : [alvo], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [selecionar ? path.dirname(alvo) : alvo], { detached: true, stdio: 'ignore' }).unref();
}

function escolherPastaWindows() {
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$o = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$f.Description = "Escolha a pasta onde os audios serao salvos"',
    '$f.ShowNewFolderButton = $true',
    "if ($f.ShowDialog($o) -eq 'OK') { $f.SelectedPath }"
  ].join('; ');
  return rodar('powershell', ['-NoProfile', '-STA', '-Command', ps], { timeout: 600000 }).then(r => r.stdout.trim());
}

// ---------- HTTP ----------
function enviarJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('JSON invalido')); } });
    req.on('error', reject);
  });
}
// So aceita chamadas da propria interface (evita que outro site mande downloads)
function origemValida(req) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) return false;
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return false;
  return true;
}
function urlValida(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!origemValida(req)) return enviarJson(res, 403, { erro: 'Origem nao permitida' });
    const u = new URL(req.url, 'http://localhost');
    const rota = req.method + ' ' + u.pathname;

    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(path.join(APP_DIR, 'ui.html')).pipe(res);
    }
    if (rota === 'GET /api/estado') {
      ultimoAcesso = Date.now();
      return enviarJson(res, 200, { setup, config, jobs: jobs.map(jobPublico) });
    }
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json'))
      return enviarJson(res, 415, { erro: 'Use application/json' });

    if (rota === 'POST /api/baixar') {
      const b = await lerCorpo(req);
      // aceita links soltos (urls) ou faixas escolhidas de uma playlist (itens)
      const itensPl = Array.isArray(b.itens) ? b.itens.filter(i => i && urlValida(i.url)) : [];
      const urls = [...new Set((b.urls || []).map(s => String(s).trim()).filter(Boolean))];
      const validas = urls.filter(urlValida);
      const invalidas = urls.filter(s => !urlValida(s));
      if (validas.length + itensPl.length > MAX_POR_ENVIO)
        return enviarJson(res, 400, { erro: 'Limite de ' + MAX_POR_ENVIO + ' faixas por envio. Divida em partes.' });
      const tipo = b.tipo === 'video' ? 'video' : 'audio';
      const formato = FORMATOS[tipo].includes(b.formato) ? b.formato : (tipo === 'video' ? config.formatoVideo : config.formato);
      if (!setup.ffmpeg && (tipo === 'video' || formato !== 'm4a'))
        return enviarJson(res, 400, { erro: (tipo === 'video' ? 'Video' : 'O formato ' + formato.toUpperCase()) + ' precisa do FFmpeg. Instale em Configuracoes' + (tipo === 'video' ? '.' : ' ou use M4A.') });
      const qualidade = QUALIDADES[tipo].includes(String(b.qualidade)) ? String(b.qualidade) : (tipo === 'video' ? config.resolucao : config.qualidadeMp3);
      const base = { tipo, formato, qualidade, legendas: tipo === 'video' && !!b.legendas };
      const novos = validas.map(x => novoJob(x, base))
        .concat(itensPl.map(i => novoJob(i.url, { ...base, titulo: i.titulo, indice: i.indice, subpasta: b.playlist })));
      jobs.push(...novos);
      proximo();
      return enviarJson(res, 200, { adicionados: novos.length, invalidas });
    }
    if (rota === 'POST /api/listar') {
      const b = await lerCorpo(req);
      if (!urlValida(b.url)) return enviarJson(res, 400, { erro: 'Link invalido' });
      if (setup.ytdlp !== 'ok') return enviarJson(res, 400, { erro: 'O yt-dlp ainda nao esta pronto.' });
      const tipo = b.tipo === 'video' ? 'video' : 'audio';
      const formato = FORMATOS[tipo].includes(b.formato) ? b.formato : FORMATOS[tipo][0];
      try { return enviarJson(res, 200, { ...(await listarPlaylist(b.url, tipo, formato)), max: MAX_POR_ENVIO }); }
      catch (e) { return enviarJson(res, 400, { erro: e.message, dica: e.dica || '' }); }
    }
    if (rota === 'POST /api/cancelar') {
      const b = await lerCorpo(req);
      const j = jobs.find(x => x.id === b.id);
      if (!j) return enviarJson(res, 404, { erro: 'Item nao encontrado' });
      if (j.status === 'fila') j.status = 'cancelado';
      else if (j.proc) { j.cancelado = true; matarArvore(j.proc); }
      return enviarJson(res, 200, { ok: true });
    }
    if (rota === 'POST /api/cancelar-todos') {
      let n = 0;
      // primeiro esvazia a fila (para nada novo comecar quando o atual for interrompido)
      for (const j of jobs) if (j.status === 'fila') { j.status = 'cancelado'; n++; }
      for (const j of jobs) if (j.proc && !j.cancelado) { j.cancelado = true; matarArvore(j.proc); n++; }
      return enviarJson(res, 200, { cancelados: n });
    }
    if (rota === 'POST /api/repetir') {
      const b = await lerCorpo(req);
      const j = jobs.find(x => x.id === b.id);
      if (!j) return enviarJson(res, 404, { erro: 'Item nao encontrado' });
      jobs.push(novoJob(j.url, j));
      proximo();
      return enviarJson(res, 200, { ok: true });
    }
    if (rota === 'POST /api/limpar') {
      for (let i = jobs.length - 1; i >= 0; i--) if (!['fila', 'baixando', 'convertendo'].includes(jobs[i].status)) jobs.splice(i, 1);
      return enviarJson(res, 200, { ok: true });
    }
    if (rota === 'POST /api/log') {
      const b = await lerCorpo(req);
      const j = jobs.find(x => x.id === b.id);
      if (!j) return enviarJson(res, 404, { erro: 'Item nao encontrado' });
      return enviarJson(res, 200, { log: j.log, comando: 'yt-dlp ' + montarArgs(j).map(a => /\s/.test(a) ? '"' + a + '"' : a).join(' ') });
    }
    if (rota === 'POST /api/abrir') {
      const b = await lerCorpo(req);
      const j = b.id ? jobs.find(x => x.id === b.id) : null;
      if (j && j.arquivos.length && fs.existsSync(j.arquivos[j.arquivos.length - 1])) abrirNoExplorer(j.arquivos[j.arquivos.length - 1], true);
      else { const p = pastaDestino(b.tipo); fs.mkdirSync(p, { recursive: true }); abrirNoExplorer(p, false); }
      return enviarJson(res, 200, { ok: true });
    }
    if (rota === 'POST /api/config') {
      const b = await lerCorpo(req);
      const novo = { ...config };
      for (const campo of ['pastaSaida', 'pastaVideos']) {
        if (typeof b[campo] === 'string' && b[campo].trim()) {
          const p = path.resolve(b[campo].trim());
          try { fs.mkdirSync(p, { recursive: true }); } catch (e) { return enviarJson(res, 400, { erro: 'Pasta invalida: ' + e.message }); }
          novo[campo] = p;
        }
      }
      if (b.tipo === 'audio' || b.tipo === 'video') novo.tipo = b.tipo;
      if (FORMATOS.audio.includes(b.formato)) novo.formato = b.formato;
      if (FORMATOS.video.includes(b.formatoVideo)) novo.formatoVideo = b.formatoVideo;
      if (QUALIDADES.video.includes(String(b.resolucao))) novo.resolucao = String(b.resolucao);
      if (typeof b.legendas === 'boolean') novo.legendas = b.legendas;
      if (['128', '192', '256', '320'].includes(String(b.qualidadeMp3))) novo.qualidadeMp3 = String(b.qualidadeMp3);
      if (typeof b.pularBaixados === 'boolean') novo.pularBaixados = b.pularBaixados;
      if (['', 'firefox', 'edge', 'chrome', 'brave'].includes(b.cookiesNavegador)) novo.cookiesNavegador = b.cookiesNavegador;
      config = novo; salvarConfig(config);
      return enviarJson(res, 200, { ok: true, config });
    }
    if (rota === 'POST /api/escolher-pasta') {
      if (!IS_WIN) return enviarJson(res, 400, { erro: 'Seletor de pasta so no Windows; digite o caminho.' });
      const p = await escolherPastaWindows();
      return enviarJson(res, 200, { pasta: p });
    }
    if (rota === 'POST /api/atualizar') {
      return enviarJson(res, 200, await atualizarYtdlp());
    }
    if (rota === 'POST /api/ytdlp/baixar') {
      prepararYtdlp(true);
      return enviarJson(res, 200, { ok: true });
    }
    if (rota === 'POST /api/ffmpeg/verificar') {
      const f = await acharFfmpeg();
      return enviarJson(res, 200, { ffmpeg: f });
    }
    if (rota === 'POST /api/encerrar') {
      for (const j of jobs) if (j.proc) { j.cancelado = true; matarArvore(j.proc); }
      enviarJson(res, 200, { ok: true });
      console.log('Encerrado pela interface.');
      return setTimeout(() => process.exit(0), 800);
    }
    if (rota === 'POST /api/ffmpeg/instalar') {
      instalarFfmpeg();
      return enviarJson(res, 200, { ok: true });
    }
    enviarJson(res, 404, { erro: 'Rota nao encontrada' });
  } catch (e) {
    enviarJson(res, 500, { erro: e.message });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    // ja esta rodando: so abre a pagina
    console.log('O Baixa Tudo ja esta aberto em http://localhost:' + PORT);
    if (ABRIR) abrirNavegador();
    return setTimeout(() => process.exit(0), 500);
  }
  console.log('[ERRO] ' + e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log('Baixa Tudo rodando em http://localhost:' + PORT + (OCULTO ? ' (sem janela)' : ''));
  if (ABRIR) abrirNavegador();
  if (OCULTO) setInterval(() => {
    const ocupado = jobAtivo || jobs.some(j => j.status === 'fila') || setup.atualizando || setup.ffmpegInstalando;
    if (!ocupado && Date.now() - ultimoAcesso > ENCERRAR_APOS_MS) { console.log('Pagina fechada ha 5 min e nada baixando: encerrando.'); process.exit(0); }
  }, 30000);
  if (setup.nodeAntigo) console.log('[AVISO] Node ' + process.versions.node + ' e antigo; o yt-dlp precisa do Node 20+ para resolver os desafios do YouTube.');
  await Promise.all([prepararYtdlp(), acharFfmpeg()]);
  console.log(setup.ffmpeg ? 'FFmpeg encontrado: ' + setup.ffmpeg : 'FFmpeg nao encontrado (M4A funciona; MP3/OPUS/OGG e capa embutida precisam dele).');
});

/**
 * Conversor de audio do Baixa Tudo.
 * Recebe arquivos (audio ou video) enviados pela interface, converte com o FFmpeg e salva na
 * pasta de conversoes. Roda varias conversoes em paralelo (cada uma usa ~1 nucleo).
 *
 * - Mesmo codec na origem e no destino (ex.: AAC -> M4A, MP3 -> MP3): so copia o audio, sem
 *   reconverter (instantaneo e sem perda).
 * - Video de entrada (MP4, MKV, WEBM...): extrai a faixa de audio.
 * - Mantem titulo/artista/album e, quando possivel, a capa (MP3, M4A, FLAC).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const FORMATOS = {
  mp3:  { ext: 'mp3',  codec: 'mp3',    perda: true,  capa: true,  args: q => ['-c:a', 'libmp3lame', '-b:a', q + 'k', '-id3v2_version', '3'] },
  m4a:  { ext: 'm4a',  codec: 'aac',    perda: true,  capa: true,  args: q => ['-c:a', 'aac', '-b:a', q + 'k', '-movflags', '+faststart'] },
  opus: { ext: 'opus', codec: 'opus',   perda: true,  capa: false, args: q => ['-c:a', 'libopus', '-b:a', Math.min(+q, 256) + 'k'] },
  // Vorbis por qualidade variavel: bitrate fixo alto falha em audio mono
  ogg:  { ext: 'ogg',  codec: 'vorbis', perda: true,  capa: false, args: q => ['-c:a', 'libvorbis', '-q:a', String({ 128: 4, 192: 6, 256: 8, 320: 9 }[q] || 6)] },
  flac: { ext: 'flac', codec: 'flac',   perda: false, capa: true,  args: () => ['-c:a', 'flac'] },
  wav:  { ext: 'wav',  codec: 'pcm',    perda: false, capa: false, args: (q, origem) => ['-c:a', (origem.bits > 16 ? 'pcm_s24le' : 'pcm_s16le')] }
};
const QUALIDADES = ['128', '192', '256', '320'];
const CODECS_SEM_PERDA = /^(flac|alac|wavpack|ape|tta|mlp|truehd|pcm_)/;
const MAX_TAMANHO = 4 * 1024 ** 3;   // 4 GB por arquivo
const MAX_PARALELO = Math.max(1, Math.min(3, os.cpus().length - 1));

function criarConversor({ ffmpeg, pastaSaida, registrarLog }) {
  const convs = [];
  let seq = 0;
  const base = path.join(os.tmpdir(), 'baixa-tudo', 'conv-' + process.pid);

  const ffprobe = () => {
    const f = ffmpeg();
    if (!f || f === 'ffmpeg') return 'ffprobe';
    return path.join(path.dirname(f), path.basename(f).replace(/^ffmpeg/i, 'ffprobe'));
  };

  function nomeLivre(pasta, nome) {
    const ext = path.extname(nome), raiz = path.basename(nome, ext);
    let alvo = path.join(pasta, nome), n = 2;
    while (fs.existsSync(alvo)) alvo = path.join(pasta, raiz + ' (' + n++ + ')' + ext);
    return alvo;
  }
  const nomeSeguro = s => String(s || 'arquivo').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'arquivo';

  function sondar(arquivo) {
    return new Promise((resolve, reject) => {
      execFile(ffprobe(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo],
        { timeout: 120000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, out) => {
          if (err) return reject(new Error('Nao consegui ler o arquivo (formato desconhecido ou corrompido).'));
          try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
        });
    });
  }

  // ---------- recebimento (upload da interface) ----------
  function receber(req, res, q, enviarJson) {
    const formato = FORMATOS[q.get('formato')] ? q.get('formato') : null;
    if (!formato) return enviarJson(res, 400, { erro: 'Formato de saida invalido' });
    if (!ffmpeg()) return enviarJson(res, 400, { erro: 'A conversao precisa do FFmpeg.' });
    const qualidade = QUALIDADES.includes(q.get('qualidade')) ? q.get('qualidade') : '192';
    const tamanho = +req.headers['content-length'] || 0;
    if (tamanho > MAX_TAMANHO) return enviarJson(res, 413, { erro: 'Arquivo maior que 4 GB' });

    const c = {
      id: ++seq, nome: nomeSeguro(q.get('nome')), tamanho, recebido: 0, formato, qualidade,
      status: 'recebendo', pct: 0, origem: null, copia: false, perdaDupla: false,
      saida: '', tamanhoSaida: 0, erro: '', criadoEm: Date.now(), proc: null, req, cancelado: false
    };
    c.dir = path.join(base, String(c.id));
    fs.mkdirSync(c.dir, { recursive: true });
    c.entrada = path.join(c.dir, c.nome);
    convs.push(c);

    const f = fs.createWriteStream(c.entrada);
    req.on('data', b => { c.recebido += b.length; });
    req.on('close', () => {
      if (req.complete || c.status !== 'recebendo') return;
      falhar(c, c.cancelado ? null : 'Envio interrompido'); f.destroy();
    });
    f.on('error', e => falhar(c, 'Falha ao gravar o arquivo recebido: ' + e.message));
    f.on('finish', async () => {
      c.req = null;
      if (c.cancelado) return;
      try {
        const info = await sondar(c.entrada);
        analisar(c, info);
        c.status = 'fila';
        proximo();
      } catch (e) { falhar(c, e.message); }
    });
    req.pipe(f);
    req.on('end', () => enviarJson(res, 200, { id: c.id }));
  }

  function analisar(c, info) {
    const streams = info.streams || [];
    const a = streams.find(s => s.codec_type === 'audio');
    if (!a) throw new Error('O arquivo nao tem faixa de audio.');
    const capa = streams.find(s => s.codec_type === 'video' && s.disposition && s.disposition.attached_pic);
    const bits = +a.bits_per_raw_sample || +a.bits_per_sample || (/s32|flt|dbl/.test(a.sample_fmt || '') ? 24 : 16);
    c.origem = {
      codec: a.codec_name, perda: !CODECS_SEM_PERDA.test(a.codec_name || ''),
      kbps: Math.round((+a.bit_rate || +info.format.bit_rate || 0) / 1000) || null,
      canais: a.channels, taxa: +a.sample_rate || null, bits,
      duracao: +info.format.duration || +a.duration || 0,
      ehVideo: streams.some(s => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic)),
      indiceAudio: a.index, indiceCapa: capa ? capa.index : null
    };
    const alvo = FORMATOS[c.formato];
    const mesmoCodec = alvo.codec === 'pcm' ? /^pcm_s(16|24)le$/.test(a.codec_name) : a.codec_name === alvo.codec;
    c.copia = mesmoCodec;                                // so troca o "envelope", sem reconverter
    c.perdaDupla = !c.copia && c.origem.perda && alvo.perda;
  }

  // ---------- conversao ----------
  function montarArgs(c, comCapa) {
    const alvo = FORMATOS[c.formato];
    const a = ['-hide_banner', '-nostdin', '-y', '-i', c.entrada, '-map', '0:' + c.origem.indiceAudio];
    if (comCapa) a.push('-map', '0:' + c.origem.indiceCapa, '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
    a.push('-map_metadata', '0');
    if (c.copia) a.push('-c:a', 'copy');
    else a.push(...alvo.args(c.qualidade, c.origem));
    if (c.copia && c.formato === 'mp3') a.push('-id3v2_version', '3');
    a.push('-progress', 'pipe:1', '-nostats', c.temp);
    return a;
  }

  function executar(c, comCapa) {
    const alvo = FORMATOS[c.formato];
    c.status = 'convertendo'; c.pct = 0;
    c.temp = path.join(c.dir, 'saida.' + alvo.ext);
    const p = spawn(ffmpeg(), montarArgs(c, comCapa), { windowsHide: true });
    c.proc = p;
    let erro = '';
    p.stdout.on('data', b => {
      const m = /out_time_us=(\d+)/.exec(b.toString()) || /out_time_ms=(\d+)/.exec(b.toString());
      if (m && c.origem.duracao) c.pct = Math.min(99.5, (+m[1] / 1e6) / c.origem.duracao * 100);
    });
    p.stderr.on('data', b => { erro = (erro + b.toString()).slice(-4000); });
    p.on('error', e => { erro += e.message; });
    p.on('close', code => {
      c.proc = null;
      if (c.cancelado) { c.status = 'cancelado'; limparTemp(c); return proximo(); }
      if (code !== 0 && comCapa) return executar(c, false);   // capa incompativel: tenta sem
      if (code !== 0) {
        falhar(c, 'FFmpeg falhou: ' + (erro.trim().split(/\r?\n/).filter(l => !/^\s*(Stream|Input|Output|Metadata|Duration|  )/.test(l)).slice(-2).join(' | ') || 'codigo ' + code));
        return proximo();
      }
      try {
        const pasta = pastaSaida();
        fs.mkdirSync(pasta, { recursive: true });
        const destino = nomeLivre(pasta, path.basename(c.nome, path.extname(c.nome)) + '.' + alvo.ext);
        try { fs.renameSync(c.temp, destino); }
        catch (e) { fs.copyFileSync(c.temp, destino); fs.unlinkSync(c.temp); }
        c.saida = destino;
        c.tamanhoSaida = fs.statSync(destino).size;
        c.pct = 100; c.status = 'concluido';
      } catch (e) { falhar(c, 'Convertido, mas nao consegui salvar na pasta: ' + e.message); }
      limparTemp(c);
      proximo();
    });
  }

  function falhar(c, msg) {
    c.status = msg ? 'erro' : 'cancelado';
    if (msg) { c.erro = msg; registrarLog && registrarLog('[conversao ' + c.nome + '] ' + msg); }
    c.req = null;
    limparTemp(c);
  }
  function limparTemp(c) {
    setTimeout(() => { try { fs.rmSync(c.dir, { recursive: true, force: true }); } catch (e) {} }, 1500);
  }

  function proximo() {
    let ativos = convs.filter(c => c.status === 'convertendo').length;
    for (const c of convs) {
      if (ativos >= MAX_PARALELO) break;
      if (c.status !== 'fila') continue;
      const alvo = FORMATOS[c.formato];
      executar(c, alvo.capa && c.origem.indiceCapa !== null);
      ativos++;
    }
  }

  // ---------- acoes da interface ----------
  function cancelar(id) {
    const c = convs.find(x => x.id === id);
    if (!c) return false;
    c.cancelado = true;
    if (c.status === 'recebendo' && c.req) { c.req.destroy(); falhar(c, null); }
    else if (c.status === 'fila') { c.status = 'cancelado'; limparTemp(c); }
    else if (c.proc) c.proc.kill();
    return true;
  }
  function cancelarTodos() {
    let n = 0;
    for (const c of convs) if (['recebendo', 'fila', 'convertendo'].includes(c.status)) { cancelar(c.id); n++; }
    return n;
  }
  function limpar() {
    for (let i = convs.length - 1; i >= 0; i--)
      if (!['recebendo', 'fila', 'convertendo'].includes(convs[i].status)) convs.splice(i, 1);
  }
  const ocupado = () => convs.some(c => ['recebendo', 'fila', 'convertendo'].includes(c.status));
  const buscar = id => convs.find(x => x.id === id);
  const publico = () => convs.map(c => ({
    id: c.id, nome: c.nome, tamanho: c.tamanho, recebido: c.recebido, formato: c.formato, qualidade: c.qualidade,
    status: c.status, pct: c.pct, origem: c.origem, copia: c.copia, perdaDupla: c.perdaDupla,
    saida: c.saida ? path.basename(c.saida) : '', tamanhoSaida: c.tamanhoSaida, erro: c.erro
  }));

  return { receber, cancelar, cancelarTodos, limpar, ocupado, buscar, publico, MAX_PARALELO, encerrar: cancelarTodos };
}

module.exports = { criarConversor, FORMATOS, QUALIDADES };

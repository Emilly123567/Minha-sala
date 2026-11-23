// =====================================================================
//  SERVIDOR DO MULTIPLAYER — Digital Life Simulator (Fase 11)
//  Node 18+ sem dependências (WebSocket implementado aqui, RFC 6455).
//    GET  /          o jogo (public/index.html, copiado do dist pelo build)
//    GET  /saude     "ok" (verificação do Render)
//    GET  /salas     lista das salas abertas (nome, pessoas)
//    WS   /ws?sala=&id=&nome=
//  Mensagens (JSON):
//    cliente → servidor: { tipo: 'msg', dados } repassa aos outros da sala
//                        { tipo: 'presenca', dados } atualiza quem está na sala
//                        { tipo: 'estado', dados } guarda o último estado da sala
//    servidor → cliente: { tipo: 'msg', dados } · { tipo: 'peers', dados: [...] } · { tipo: 'estado', dados }
//  O último estado de cada sala fica em memória e em DATA_DIR (se der para gravar).
//  No Render o disco do plano gratuito é apagado a cada deploy: por isso o jogo
//  também guarda os saves da sala no computador do dono (Save Exclusivo).
// =====================================================================
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORTA = +process.env.PORT || 10000, DATA = process.env.DATA_DIR || path.join(__dirname, 'data'), MAX = 8 * 1024 * 1024;
const PUBLICO = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, '..', 'dist', 'digital-life-simulator.html')];
const salas = new Map(); // nome → { clientes: Set, estado, presencas: Map }
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) { /* sem disco */ }
const arqSala = (s) => path.join(DATA, s.replace(/[^\w-]/g, '_').slice(0, 60) + '.json');
function sala(nome) {
  let s = salas.get(nome); if (s) return s;
  s = { clientes: new Set(), estado: null, presencas: new Map() }; try { s.estado = JSON.parse(fs.readFileSync(arqSala(nome), 'utf8')); } catch (e) { /* nova */ }
  salas.set(nome, s); return s;
}
// ---------------- HTTP ----------------
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/saude') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (u.pathname === '/salas') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify([...salas].map(([n, s]) => ({ sala: n, pessoas: s.clientes.size })))); }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    for (const p of PUBLICO) { try { const html = fs.readFileSync(p); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(html); } catch (e) { /* tenta o próximo */ } }
    res.writeHead(500); return res.end('Rode python3 tools/build.py antes (falta public/index.html).');
  }
  res.writeHead(404); res.end('não encontrado');
});
// ---------------- WebSocket ----------------
srv.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x'), chave = req.headers['sec-websocket-key'];
  if (u.pathname !== '/ws' || !chave || !u.searchParams.get('sala')) { sock.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + aceite + '\r\n\r\n');
  const c = { sock, sala: u.searchParams.get('sala').slice(0, 80), id: (u.searchParams.get('id') || '').slice(0, 64), nome: (u.searchParams.get('nome') || '').slice(0, 40), buf: Buffer.alloc(0), partes: [], vivo: true };
  const s = sala(c.sala); s.clientes.add(c); s.presencas.set(c.id, { id: c.id, nome: c.nome });
  if (s.estado) enviar(c, { tipo: 'estado', dados: s.estado }); else enviar(c, { tipo: 'estado', dados: null });
  peers(s);
  sock.on('data', (d) => { c.vivo = true; c.buf = Buffer.concat([c.buf, d]); if (c.buf.length > MAX + 16) return fechar(c); ler(c); });
  sock.on('close', () => sair(c)); sock.on('error', () => sair(c));
});
function quadro(op, dados) {
  const n = dados.length; let cab;
  if (n < 126) cab = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { cab = Buffer.alloc(4); cab[0] = 0x80 | op; cab[1] = 126; cab.writeUInt16BE(n, 2); }
  else { cab = Buffer.alloc(10); cab[0] = 0x80 | op; cab[1] = 127; cab.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([cab, dados]);
}
function enviar(c, o) { try { c.sock.write(quadro(1, Buffer.from(JSON.stringify(o)))); } catch (e) { /* caiu */ } }
function ler(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return; const fin = b[0] & 0x80, op = b[0] & 0x0f, mascara = b[1] & 0x80; let n = b[1] & 0x7f, i = 2;
    if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); i = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); i = 10; }
    if (n > MAX) return fechar(c); const m = mascara ? b.slice(i, i + 4) : null; if (mascara) i += 4; if (b.length < i + n) return;
    const dados = Buffer.from(b.slice(i, i + n)); if (m) for (let k = 0; k < n; k++) dados[k] ^= m[k & 3]; c.buf = b.slice(i + n);
    if (op === 8) return fechar(c); if (op === 9) { c.sock.write(quadro(10, dados)); continue; } if (op === 10) { c.vivo = true; continue; }
    if (op === 1 || op === 0) { c.partes.push(dados); if (fin) { const txt = Buffer.concat(c.partes).toString('utf8'); c.partes = []; receber(c, txt); } }
  }
}
function receber(c, txt) {
  let m; try { m = JSON.parse(txt); } catch (e) { return; } const s = sala(c.sala);
  if (m.tipo === 'msg') { for (const o of s.clientes) if (o !== c) enviar(o, { tipo: 'msg', dados: m.dados }); }
  else if (m.tipo === 'presenca' && m.dados && typeof m.dados === 'object') { s.presencas.set(c.id, Object.assign({}, m.dados, { id: c.id })); peers(s); }
  else if (m.tipo === 'estado') { s.estado = m.dados; clearTimeout(s.gravar); s.gravar = setTimeout(() => { try { fs.writeFileSync(arqSala(c.sala), JSON.stringify(s.estado)); } catch (e) { /* sem disco */ } }, 2000); }
}
function peers(s) { const ids = new Set([...s.clientes].map((x) => x.id)); const l = [...s.presencas.values()].filter((p) => ids.has(p.id)); for (const o of s.clientes) enviar(o, { tipo: 'peers', dados: l }); }
function fechar(c) { try { c.sock.write(quadro(8, Buffer.alloc(0))); c.sock.end(); } catch (e) { /* ignora */ } sair(c); }
function sair(c) { const s = salas.get(c.sala); if (!s || !s.clientes.has(c)) return; s.clientes.delete(c); if (![...s.clientes].some((x) => x.id === c.id)) s.presencas.delete(c.id); peers(s); }
// ping a cada 25 s (o Render fecha conexões paradas)
setInterval(() => { for (const s of salas.values()) for (const c of s.clientes) { if (!c.vivo) { fechar(c); continue; } c.vivo = false; try { c.sock.write(quadro(9, Buffer.alloc(0))); } catch (e) { /* ignora */ } } }, 25000).unref();
srv.listen(PORTA, () => console.log('Digital Life Simulator: servidor na porta ' + PORTA));
module.exports = srv;

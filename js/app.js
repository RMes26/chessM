import { Chess } from '../lib/chess.js';
import { Board } from './board.js?v=5';
import { Engine, botMove } from './engine.js?v=5';
import { analyseGame, CLASSES, evalText } from './analysis.js?v=5';
import { play, sound, unlockAudio } from './sound.js?v=5';
import { Online } from './online.js?v=5';
import { CATS, catOf, newRating, update as glicko, shown, provisional } from './rating.js?v=5';
import { confetti, shake } from './fx.js?v=5';
import { createPuzzles, currentStreak } from './puzzles.js?v=5';
import { detect, speak, callouts } from './callout.js?v=5';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = n => String(n || 'Ami').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Ami';
const other = c => (c === 'w' ? 'b' : 'w');

// ---------- Données ----------
const BOTS = [
  { name: 'Pousse', elo: 400, desc: 'Découvre les règles', color: '#8bc34a' },
  { name: 'Lucie', elo: 700, desc: 'Joue pour le plaisir', color: '#4fc3f7' },
  { name: 'Marc', elo: 1000, desc: 'Débutant motivé', color: '#ffb74d' },
  { name: 'Inès', elo: 1200, desc: 'Connaît ses ouvertures', color: '#ba68c8' },
  { name: 'Karim', elo: 1500, desc: 'Joueur de club', color: '#4db6ac' },
  { name: 'Sofia', elo: 1800, desc: 'Joueuse confirmée', color: '#f06292' },
  { name: 'Viktor', elo: 2100, desc: 'Candidat maître', color: '#7986cb' },
  { name: 'Alex', elo: 2500, desc: 'Niveau maître', color: '#ff8a65' },
  { name: 'Titan', elo: 3200, desc: 'Moteur à pleine puissance', color: '#e53935' }
];
const TCS = [
  { id: '0', label: '∞', sub: 'Sans limite', base: 0, inc: 0 },
  { id: '1+0', label: '1+0', sub: 'Bullet', base: 60, inc: 0 },
  { id: '3+2', label: '3+2', sub: 'Blitz', base: 180, inc: 2 },
  { id: '5+0', label: '5+0', sub: 'Blitz', base: 300, inc: 0 },
  { id: '10+0', label: '10+0', sub: 'Rapide', base: 600, inc: 0 },
  { id: '15+10', label: '15+10', sub: 'Rapide', base: 900, inc: 10 }
];
const COLORS = [{ id: 'w', label: '♔ Blancs' }, { id: 'r', label: '🎲 Aléatoire' }, { id: 'b', label: '♚ Noirs' }];
const THEMES = [{ id: 'bronze', label: 'Bronze' }, { id: 'bois', label: 'Noyer' }, { id: 'nuit', label: 'Nuit' }, { id: 'marbre', label: 'Marbre' }, { id: 'vert', label: 'Jade' }, { id: 'bleu', label: 'Ardoise' }, { id: 'rubis', label: 'Rubis' }];
const ACCENTS = [['Or', '#d4af37'], ['Champagne', '#e8cf9a'], ['Rubis', '#e0245e'], ['Grenat', '#b4233c'], ['Émeraude', '#2fbf71'], ['Saphir', '#3b82f6'], ['Améthyste', '#9b6bdf'], ['Cuivre', '#c8784a'], ['Platine', '#cfd6de']];
const GOOD = ['best', 'brilliant', 'great'];

const store = (() => {
  const KEY = 'echecs.v1';
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  d = { name: 'Joueur', elo: 1000, games: 0, w: 0, d: 0, l: 0, tc: '10+0', color: 'w', theme: 'bronze', sound: true, ...d };
  if (!d.ratings) { // migration de l'ancien Elo simple vers Glicko-2
    d.ratings = {};
    for (const k of Object.keys(CATS)) d.ratings[k] = k === 'puzzle' ? newRating(1000) : newRating(d.elo, d.games ? 180 : 250);
  }
  for (const k of Object.keys(CATS)) d.ratings[k] ||= newRating(1000);
  d.daily ||= { last: null, streak: 0, best: 0, done: {} };
  d.best ||= {};
  d.prefs = { accent: '#d4af37', anim: true, fx: true, voice: true, callouts: true, ...(d.prefs || {}) };
  return { d, save() { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} } };
})();
store.save();
sound.enabled = store.d.sound;

const engine = new Engine();
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const board = new Board($('#board'), { onMove: mv => { if (canPlay()) playMove(mv); } });
let G = null;        // partie en cours
let online = null;   // connexion ami
let hostLink = '';

// ---------- Utilitaires ----------
const frSan = s => s.replace(/[KQRBN]/g, m => ({ K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }[m]));
const uciToSan = (fen, uci) => { try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return uci; } };
const hist = () => G.chess.history({ verbose: true });
const fenAt = p => (p === 0 ? G.startFen : hist()[p - 1].after);
const tcOf = id => TCS.find(t => t.id === id) || TCS[4];
const pickColor = () => (store.d.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : store.d.color);

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); window.scrollTo(0, 0); }
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (c, t, to) => c.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',');
const accent = () => store.d.prefs.accent;
function applyTheme() {
  const P = store.d.prefs, b = document.body, st = document.documentElement.style, rgb = hexRgb(P.accent);
  b.dataset.theme = store.d.theme;
  st.setProperty('--acc', P.accent); st.setProperty('--acc-rgb', rgb.join(','));
  st.setProperty('--acc-hi', `rgb(${mix(rgb, .45, [255, 255, 255])})`); st.setProperty('--acc-lo', `rgb(${mix(rgb, .45, [0, 0, 0])})`);
  st.setProperty('--acc-ink', (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55 ? '#17130b' : '#ffffff');
  b.classList.toggle('no-anim', !P.anim); b.classList.toggle('no-fx', !P.fx);
  sound.enabled = store.d.sound; callouts.voice = P.voice; callouts.visual = P.callouts;
}
function announce(m, chess, bd) {
  const co = detect(m, chess); if (!co) return;
  if (store.d.prefs.callouts) bd.callout(co.text, co.icon);
  speak(co.say);
}
function fmtClock(ms) {
  ms = Math.max(0, ms);
  const s = ms / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
const curCat = () => catOf(tcOf(store.d.tc));
const rtxt = p => shown(p) + (provisional(p) ? '?' : '');

// ---------- Accueil ----------
function renderHome() {
  const d = store.d;
  const cr = d.ratings[curCat()];
  $('#eloChip').textContent = `${CATS[curCat()].icon} ${rtxt(cr)}`;
  $('#btnSound').textContent = d.sound ? '🔊' : '🔇';
  $('#meAvatar').textContent = d.name[0]?.toUpperCase() || '?';
  if (document.activeElement !== $('#nameInput')) $('#nameInput').value = d.name;
  $('#eloBig').textContent = rtxt(cr);
  $('#eloCat').textContent = CATS[curCat()].label;
  $('#ratings').innerHTML = Object.keys(CATS).map(k => `<div class="rtile ${k === curCat() ? 'on' : ''}"><span>${CATS[k].icon} ${CATS[k].label}</span><b>${rtxt(d.ratings[k])}</b></div>`).join('');
  const st = currentStreak(d.daily);
  $('#pzModes').innerHTML = [
    ['daily', '📅', 'Problème du jour', d.daily.done[todayKey()] ? "✅ Fait aujourd'hui" : `🔥 Série : ${st} jour${st > 1 ? 's' : ''}`],
    ['rated', '🎯', 'Entraînement', `Classé · ${rtxt(d.ratings.puzzle)}`],
    ['survival', '❤️', 'Survie', `3 vies · record ${d.best.survival || 0}`],
    ['chrono', '⏱️', 'Contre-la-montre', `3 min · record ${d.best.chrono || 0}`]
  ].map(([m, i, t, s]) => `<button class="pzmode" data-act="pz" data-mode="${m}"><span class="pzi">${i}</span><b>${t}</b><small>${s}</small></button>`).join('');
  $('#stats').innerHTML = `<span class="w">${d.w} V</span> · <span class="d">${d.d} N</span> · <span class="l">${d.l} D</span>`;
  $('#tcChips').innerHTML = TCS.map(t => `<button class="chip-btn ${d.tc === t.id ? 'on' : ''}" data-act="tc" data-v="${t.id}"><b>${t.label}</b><small>${t.sub}</small></button>`).join('');
  $('#colorChips').innerHTML = COLORS.map(c => `<button class="chip-btn ${d.color === c.id ? 'on' : ''}" data-act="color" data-v="${c.id}">${c.label}</button>`).join('');
  const hr = new Date().getHours();
  $('#greet').textContent = `${hr >= 18 || hr < 5 ? 'Bonsoir' : 'Bonjour'},`;
  $('#botGrid').innerHTML = BOTS.map((b, i) => `<button class="bot" data-act="bot" data-i="${i}">
      <span class="avatar" style="background:${b.color}">${b.name[0]}</span>
      <span class="bot-info"><b>${b.name}</b><small>${b.desc}</small></span><span class="bot-elo">${b.elo}</span></button>`).join('');
  drawSpark();
}
function drawSpark() {
  const cv = $('#eloSpark'), h = store.d.ratings[curCat()].hist;
  cv.classList.toggle('empty', h.length < 2);
  const w = cv.clientWidth || 200, H = 40, dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, H);
  if (h.length < 2) return;
  const mn = Math.min(...h) - 10, mx = Math.max(...h) + 10;
  x.strokeStyle = accent(); x.lineWidth = 2; x.beginPath();
  h.forEach((v, i) => { const px = i / (h.length - 1) * (w - 4) + 2, py = H - 4 - (v - mn) / (mx - mn) * (H - 8); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
}

// ---------- Partie ----------
function newGame(o) {
  closeModal();
  const tc = o.tc || tcOf(store.d.tc);
  const c = new Chess();
  G = {
    id: Math.random(), mode: o.mode, bot: o.bot || null, opp: o.opp, myColor: o.myColor,
    chess: c, startFen: c.fen(), tc: { base: tc.base, inc: tc.inc, label: tc.label },
    clock: { w: tc.base * 1000, b: tc.base * 1000 }, clockRunning: false, lastTick: 0,
    over: false, result: null, reason: '', viewPly: 0, analysis: null, analysing: false,
    rated: o.mode === 'bot', cat: catOf(tc), thinking: false, eloDelta: null, connected: o.mode === 'online'
  };
  board.setOrientation(G.myColor);
  board.setPosition(G.startFen, {});
  showScreen('game');
  play('start');
  render();
  if (G.mode === 'bot') {
    if (!engine.ready) toast('Chargement du moteur…');
    engine.newGame().catch(engineError);
    if (G.myColor === 'b') scheduleBot();
  }
}

function startBot(i) {
  const bot = BOTS[i];
  newGame({ mode: 'bot', bot, myColor: pickColor(), opp: { name: bot.name, elo: bot.elo, color: bot.color } });
}

function canPlay() {
  return G && !G.over && G.viewPly === G.chess.history().length && G.chess.turn() === G.myColor && (G.mode !== 'online' || G.connected);
}

function playMove(mv, remote = false) {
  if (!G || G.over) return false;
  let m;
  try { m = G.chess.move(mv); } catch { return false; }
  if (!m) return false;
  if (G.tc.base) {
    const now = performance.now();
    if (G.clockRunning) { G.clock[m.color] -= now - G.lastTick; G.clock[m.color] += G.tc.inc * 1000; }
    G.clockRunning = true; G.lastTick = now;
  }
  const prev = G.viewPly, ply = G.chess.history().length;
  G.viewPly = ply;
  play(G.chess.inCheck() ? 'check' : m.captured ? 'capture' : /[kq]/.test(m.flags) ? 'castle' : 'move');
  if (G.mode === 'online' && !remote) online?.send({ t: 'move', uci: m.lan, clock: G.clock });
  stopScenario(false);
  render(prev === ply - 1 ? { move: m } : {});
  announce(m, G.chess, board);
  if (!checkEnd() && G.mode === 'bot' && G.chess.turn() !== G.myColor) scheduleBot();
  return true;
}

function scheduleBot() {
  const id = G.id, botColor = G.chess.turn(), fen = G.chess.fen(), t0 = performance.now();
  G.thinking = true; renderBars();
  botMove(engine, fen, G.bot, G.tc.base ? G.clock[botColor] : null).then(uci => {
    if (!G || G.id !== id || G.over) return;
    let minT = G.tc.base ? Math.min(900, G.clock[botColor] / 40) : 700;
    minT *= 0.5 + Math.random();
    setTimeout(() => {
      if (!G || G.id !== id || G.over) return;
      G.thinking = false;
      if (uci) playMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }, Math.max(0, minT - (performance.now() - t0)));
  }).catch(engineError);
}

function engineError(e) {
  console.error(e);
  toast('Le moteur n\'a pas pu démarrer. Ouvre le jeu via un lien http(s), pas en fichier local.', 6000);
}

function checkEnd() {
  const c = G.chess;
  if (c.isCheckmate()) endGame(other(c.turn()), 'par échec et mat');
  else if (c.isStalemate()) endGame('draw', 'par pat');
  else if (c.isInsufficientMaterial()) endGame('draw', 'matériel insuffisant');
  else if (c.isThreefoldRepetition()) endGame('draw', 'par triple répétition');
  else if (c.isDrawByFiftyMoves()) endGame('draw', 'règle des 50 coups');
  else return false;
  return true;
}

function onlyKing(color) { return !G.chess.board().flat().some(p => p && p.color === color && p.type !== 'k'); }
function timeout(color) {
  const w = other(color);
  if (onlyKing(w)) endGame('draw', 'temps écoulé, matériel insuffisant');
  else endGame(w, 'au temps');
}

// result: 'w' | 'b' | 'draw' | 'none'
function endGame(result, reason) {
  if (!G || G.over) return;
  G.over = true; G.result = result; G.reason = reason; G.thinking = false;
  if (G.rated && result !== 'none') {
    const d = store.d, score = result === 'draw' ? 0.5 : result === G.myColor ? 1 : 0;
    const R = d.ratings[G.cat];
    G.eloBefore = shown(R);
    G.eloDelta = glicko(R, G.bot.elo, 60, score);
    d.games++; d[score === 1 ? 'w' : score === 0 ? 'l' : 'd']++;
    store.save(); renderHome();
  }
  const won = result === G.myColor;
  play(won ? 'win' : result === 'draw' || result === 'none' ? 'end' : 'lose');
  if (won) setTimeout(() => confetti(), 300);
  render();
  setTimeout(showEndModal, 500);
}

function showEndModal() {
  if (!G || !G.over) return;
  const r = G.result, win = r === G.myColor, draw = r === 'draw';
  const title = r === 'none' ? 'Partie interrompue' : draw ? 'Partie nulle' : win ? 'Victoire !' : 'Défaite';
  const icon = r === 'none' ? '⚠️' : draw ? '🤝' : win ? '🏆' : '😔';
  let elo = '';
  if (G.eloDelta != null) {
    const d = G.eloDelta, cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    elo = `<div class="elo-change">${CATS[G.cat].icon} ${CATS[G.cat].label} : ${G.eloBefore} → <b>${shown(store.d.ratings[G.cat])}</b> <span class="${cls}">${d > 0 ? '+' : ''}${d}</span></div>`;
  }
  const canRematch = G.mode === 'bot' || (G.mode === 'online' && G.connected);
  modal(`<div class="end-icon">${icon}</div><h2>${title}</h2><p class="muted">${esc(G.reason)}</p>${elo}
    <div class="btn-col">
      <button class="btn primary" data-act="review">🔍 Revoir et analyser la partie</button>
      ${canRematch ? '<button class="btn" data-act="rematch">↻ Revanche</button>' : ''}
      <button class="btn ghost" data-act="home">Menu principal</button>
    </div>`);
}

// ---------- Rendu de la partie ----------
function render(o = {}) {
  if (!G) return;
  const h = hist(), p = G.viewPly, S = G.scn;
  const fen = S ? S.fens[S.i] : fenAt(p);
  const tmp = new Chess(fen);
  let check = null;
  if (tmp.inCheck()) check = tmp.board().flat().find(x => x && x.type === 'k' && x.color === tmp.turn())?.square;
  const last = S ? (S.i > 0 ? S.moves[S.i - 1] : (S.basePly > 0 ? h[S.basePly - 1] : null)) : (p > 0 ? h[p - 1] : null);
  board.setPosition(fen, { move: o.move, reverse: o.reverse, lastMove: last, check, ghost: !!S });
  board.setInteractive(!S && canPlay() ? G.myColor : null, sq => G.chess.moves({ square: sq, verbose: true }));
  // Analyse : badge, flèche + pièce fantôme du meilleur coup
  const A = G.analysis;
  const c = !S && A && p > 0 ? A.cls[p - 1] : null;
  board.setGhost(null);
  if (S) {
    board.setBadge(null);
    const nx = S.moves[S.i];
    board.setArrows(nx ? [{ from: nx.from, to: nx.to, color: accent() }] : []);
  } else if (c) {
    const info = CLASSES[c.cls];
    board.setBadge({ sq: h[p - 1].to, sym: info.sym, color: info.color });
    const best = A.evals[p - 1]?.best;
    if (best && !GOOD.includes(c.cls)) {
      board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), color: accent() }]);
      board.setGhost({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4], piece: new Chess(fenAt(p - 1)).get(best.slice(0, 2)) });
    } else board.setArrows([]);
  } else { board.setBadge(null); board.setArrows([]); }
  renderEvalBar();
  renderBars();
  renderMoves();
  renderReview();
  renderActions();
}

function renderEvalBar() {
  const A = G.analysis, ev = A?.evals[G.viewPly];
  const bar = $('#evalBar');
  const show = !!(A && G.over);
  bar.classList.toggle('hidden', !show);
  $('.board-row').classList.toggle('with-eval', show);
  if (!show) return;
  const wp = ev ? ev.wp : 50;
  bar.classList.toggle('flip', board.orientation === 'b');
  $('#evalFill').style.height = wp + '%';
  const t = $('#evalTxt');
  t.textContent = ev ? evalText(ev).replace('+', '') : '…';
  t.className = wp >= 50 ? 'white-adv' : 'black-adv';
}

function material(fen) {
  const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  for (const ch of fen.split(' ')[0]) if (/[a-z]/i.test(ch)) cnt[ch === ch.toUpperCase() ? 'w' : 'b'][ch.toLowerCase()]++;
  return cnt;
}
function capturedHtml(color, cnt) {
  const opp = other(color), init = { p: 8, n: 2, b: 2, r: 2, q: 1 }, V = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const N = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
  let h = '';
  for (const t of ['p', 'n', 'b', 'r', 'q']) {
    const miss = Math.max(0, init[t] - cnt[opp][t]);
    if (miss) h += `<span class="cgroup">${`<i class="piece ${N[t]} ${opp === 'w' ? 'white' : 'black'}"></i>`.repeat(miss)}</span>`;
  }
  const sc = c => Object.keys(V).reduce((a, t) => a + V[t] * cnt[c][t], 0);
  const diff = sc(color) - sc(opp);
  return h + (diff > 0 ? `<span class="adv">+${diff}</span>` : '');
}

function renderBars() {
  if (!G) return;
  const bottom = board.orientation, top = other(bottom);
  const cnt = material(fenAt(G.viewPly));
  for (const [id, col] of [['#barTop', top], ['#barBottom', bottom]]) {
    const me = col === G.myColor;
    const info = me ? { name: store.d.name, elo: G.mode === 'bot' ? rtxt(store.d.ratings[G.cat]) : null, color: '#5d9cec' } : G.opp;
    const active = !G.over && G.chess.turn() === col;
    const think = !me && G.thinking ? '<span class="thinking"><i></i><i></i><i></i></span>' : '';
    $(id).innerHTML = `<span class="avatar" style="background:${info.color}">${esc(info.name[0]?.toUpperCase() || '?')}</span>
      <div class="pmeta"><div class="pname">${esc(info.name)}${info.elo != null ? ` <span class="pelo">(${info.elo})</span>` : ''}${think}</div>
      <div class="capt">${capturedHtml(col, cnt)}</div></div>
      ${G.tc.base ? `<div class="clock ${active ? 'on' : ''} ${col === 'w' ? 'cw' : 'cb'}" data-c="${col}">${fmtClock(G.clock[col])}</div>` : ''}`;
  }
}
function renderClocks() {
  document.querySelectorAll('.clock[data-c]').forEach(el => {
    const c = el.dataset.c, ms = G.clock[c];
    el.textContent = fmtClock(ms);
    el.classList.toggle('low', ms < 20000);
    el.classList.toggle('on', !G.over && G.chess.turn() === c);
  });
}

function renderMoves() {
  const h = hist(), A = G.analysis, SHOW = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  let html = '';
  for (let i = 0; i < h.length; i += 2) {
    html += `<div class="mrow"><span class="mnum">${i / 2 + 1}.</span>`;
    for (const j of [i, i + 1]) {
      if (j >= h.length) { html += '<span class="mv empty"></span>'; continue; }
      const c = A?.cls[j], info = c && SHOW.includes(c.cls) ? CLASSES[c.cls] : null;
      html += `<span class="mv ${G.viewPly === j + 1 ? 'cur' : ''}" data-act="goto" data-ply="${j + 1}">${info ? `<i class="mglyph" style="background:${info.color}">${info.sym}</i>` : ''}${esc(frSan(h[j].san))}</span>`;
    }
    html += '</div>';
  }
  const el = $('#moves');
  el.innerHTML = html || '<p class="muted center">La partie commence. Bonne chance !</p>';
  const cur = el.querySelector('.cur');
  if (cur) {
    const top = cur.offsetTop - el.offsetTop;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 30) el.scrollTop = top - el.clientHeight / 2;
  } else if (G.viewPly === h.length) el.scrollTop = el.scrollHeight;
}

function renderActions() {
  const a = $('#actions');
  if (!G.over) {
    const n = G.chess.history().length;
    a.innerHTML = (n < 2 && G.mode === 'bot' ? '<button class="btn" data-act="abort">✕ Annuler</button>' : `<button class="btn" data-act="resign">🏳 Abandonner</button>`)
      + (G.mode === 'online' ? '<button class="btn" data-act="draw">½ Proposer nulle</button>' : '');
  } else {
    const canRematch = G.mode === 'bot' || (G.mode === 'online' && G.connected);
    a.innerHTML = (canRematch ? '<button class="btn" data-act="rematch">↻ Revanche</button>' : '')
      + '<button class="btn primary" data-act="home">Nouvelle partie</button>';
  }
}

// ---------- Revue ----------
function startAnalysis() {
  if (!G || !G.over || G.analysing || G.analysis?.done) return;
  G.analysing = true;
  const id = G.id;
  if (!engine.ready) toast('Chargement du moteur…');
  analyseGame(engine, G.startFen, hist(), res => {
    if (!G || G.id !== id) return;
    G.analysis = res;
    if (res.done) G.analysing = false;
    render();
  }, () => !G || G.id !== id).catch(e => { if (G) G.analysing = false; engineError(e); render(); });
  if (G.viewPly === G.chess.history().length) G.viewPly = 0;
  render();
}

function renderReview() {
  const el = $('#review');
  if (!G.over) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const A = G.analysis, h = hist(), p = G.viewPly;
  if (!A) {
    el.innerHTML = `<h3>Revue de partie</h3><p class="muted">Classification des coups (brillants, gaffes…), précision et courbe d'évaluation.</p>
      <button class="btn primary wide" data-act="review">⚡ Analyser la partie</button>`;
    return;
  }
  const pct = Math.round(A.progress * 100);
  const accHtml = c => `<div class="acc ${c}"><small>${c === 'w' ? 'Blancs' : 'Noirs'}${c === G.myColor ? ' (toi)' : ''}</small><b>${A.acc[c] != null ? A.acc[c].toFixed(1) : '…'}</b><small>précision</small></div>`;
  let comment = '<span class="muted">Position de départ. Utilise ◀ ▶ pour parcourir la partie.</span>';
  if (p > 0 && A.cls[p - 1]) {
    const c = A.cls[p - 1], info = CLASSES[c.cls], san = frSan(h[p - 1].san);
    const verb = { brilliant: 'est un coup brillant !', great: 'est un très bon coup : le seul qui tient.', best: 'est le meilleur coup.', excellent: 'est excellent.', good: 'est un bon coup.', inaccuracy: 'est une imprécision.', mistake: 'est une erreur.', miss: ': occasion manquée de punir l\'adversaire.', blunder: 'est une gaffe.' }[c.cls];
    const best = A.evals[p - 1]?.best;
    const alt = best && !['best', 'brilliant', 'great'].includes(c.cls) ? `<div class="bestline">Meilleur coup : <b>${esc(frSan(uciToSan(fenAt(p - 1), best)))}</b></div>` : '';
    const mover = h[p - 1].color, evB = A.evals[p - 1], evA = A.evals[p];
    const had = mateFor(evB, mover), still = mateFor(evA, mover), opp = mateFor(evA, other(mover));
    let mate = '';
    if (evA?.mate === 0) mate = '<div class="mate ok">♚ Échec et mat !</div>';
    else if (had && still && still < had) mate = `<div class="mate ok">♛ Mat forcé : plus que ${still} coup${still > 1 ? 's' : ''} !</div>`;
    else if (had && still) mate = `<div class="mate">♛ Toujours un mat en ${still}, mais il y avait plus rapide (mat en ${had}).</div>`;
    else if (had) mate = `<div class="mate miss">♛ Il y avait un mat en ${had} !</div>`;
    if (opp) mate += `<div class="mate warn">⚠ L'adversaire a maintenant un mat en ${opp}.</div>`;
    const btn = !GOOD.includes(c.cls) && evB?.pv?.length ? `<button class="btn sm gold" data-act="scnAlt">🔮 Voir ce qu'il fallait jouer</button>`
      : evA?.pv?.length ? `<button class="btn sm" data-act="scnNext">🔮 Voir la suite idéale</button>` : '';
    comment = `<div class="cmt"><i class="cglyph" style="background:${info.color}">${info.sym}</i><div><b style="color:${info.color}">${esc(san)}</b> ${verb}${alt}</div><span class="cev">${evalText(A.evals[p])}</span></div>${mate}${btn}`;
  } else if (p > 0) comment = '<span class="muted">Analyse de ce coup en cours…</span>';
  if (G.scn) comment = scenarioHtml();
  const rows = Object.keys(CLASSES).map(k => {
    const i = CLASSES[k];
    return `<tr><td class="cw-n">${A.done ? (A.counts.w[k] || 0) : ''}</td><td><i class="mglyph" style="background:${i.color}">${i.sym}</i> ${i.label}</td><td class="cb-n">${A.done ? (A.counts.b[k] || 0) : ''}</td></tr>`;
  }).join('');
  el.innerHTML = `<h3>Revue de partie ${A.done ? '' : `<small class="muted">analyse… ${pct}%</small>`}</h3>
    ${A.done ? '' : `<div class="progress"><i style="width:${pct}%"></i></div>`}
    <div class="accs">${accHtml('w')}${accHtml('b')}</div>
    <canvas id="graph" height="80"></canvas>
    <div class="comment">${comment}</div>
    <details ${A.done ? 'open' : ''}><summary>Détail des coups</summary><table class="counts"><thead><tr><th>Blancs</th><th></th><th>Noirs</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  drawGraph();
}

const mateFor = (ev, col) => ev && ev.mate != null && ev.mate !== 0 && ((col === 'w') === (ev.mate > 0)) ? Math.abs(ev.mate) : 0;

// ---------- Scénarios (meilleure ligne jouée en pièces fantômes) ----------
function buildScenario(basePly, pv, title) {
  const c = new Chess(fenAt(basePly)), fens = [c.fen()], moves = [];
  for (const u of pv) {
    try { moves.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })); fens.push(c.fen()); } catch { break; }
  }
  return moves.length ? { basePly, fens, moves, i: 0, title, timer: null, playing: false, mate: c.isCheckmate() } : null;
}
function startScenario(kind) {
  const A = G?.analysis, p = G?.viewPly; if (!A || !p) return;
  stopScenario(false);
  const S = kind === 'alt' ? buildScenario(p - 1, A.evals[p - 1]?.pv || [], 'Ce qu\'il fallait jouer') : buildScenario(p, A.evals[p]?.pv || [], 'La suite idéale');
  if (!S) { toast('Pas de ligne disponible pour ce coup.'); render(); return; }
  G.scn = S; render(); playScenario();
}
function playScenario() {
  const S = G?.scn; if (!S) return;
  if (S.i >= S.moves.length) { S.i = 0; render(); }
  S.playing = true; clearTimeout(S.timer);
  const step = () => {
    if (!G || G.scn !== S || !S.playing) return;
    if (S.i >= S.moves.length) { S.playing = false; renderReview(); return; }
    scnStep(1, true); S.timer = setTimeout(step, 1000);
  };
  S.timer = setTimeout(step, 600); renderReview();
}
function scnStep(d, auto = false) {
  const S = G?.scn; if (!S) return;
  if (!auto) { S.playing = false; clearTimeout(S.timer); }
  const ni = S.i + d; if (ni < 0 || ni > S.moves.length) { renderReview(); return; }
  const o = d > 0 ? { move: S.moves[ni - 1] } : { move: S.moves[S.i - 1], reverse: true };
  S.i = ni;
  if (d > 0) play(S.moves[ni - 1].captured ? 'capture' : 'move');
  render(o);
}
function stopScenario(rerender = true) {
  if (!G?.scn) return;
  clearTimeout(G.scn.timer); G.scn = null;
  if (rerender) render();
}
function scenarioHtml() {
  const S = G.scn, A = G.analysis;
  const ev = A.evals[S.basePly], n = Math.abs(ev?.mate || 0);
  const line = S.moves.map((m, k) => {
    const num = S.fens[k].split(' ')[5];
    const pre = m.color === 'w' ? `<i class="mn">${num}.</i>` : k === 0 ? `<i class="mn">${num}…</i>` : '';
    return `${pre}<span class="sm-mv ${k === S.i - 1 ? 'cur' : ''} ${k >= S.i ? 'todo' : ''}">${esc(frSan(m.san))}</span>`;
  }).join(' ');
  return `<div class="scn"><div class="scn-head">🔮 ${S.title}${S.mate && n ? ` <span class="mate-pill">Mat en ${n}</span>` : ''}</div>
    <div class="scn-line">${line}</div>
    <div class="scn-ctl"><button class="btn sm" data-act="scnPrev">◀</button><button class="btn sm" data-act="scnToggle">${S.playing ? '⏸ Pause' : '▶ Lire'}</button><button class="btn sm" data-act="scnFwd">▶</button><button class="btn sm ghost" data-act="scnClose">✕ Fermer</button></div></div>`;
}

function drawGraph() {
  const cv = $('#graph'); if (!cv) return;
  const A = G.analysis, ev = A.evals, n = G.chess.history().length;
  const w = cv.clientWidth || 300, H = 80, dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  x.fillStyle = '#141318'; x.fillRect(0, 0, w, H);
  const X = i => (n ? i / n : 0) * w, Y = wp => H - wp / 100 * H;
  x.beginPath(); x.moveTo(0, H);
  ev.forEach((e, i) => { if (e) x.lineTo(X(i), Y(e.wp)); });
  x.lineTo(X(ev.length - 1), H); x.closePath();
  x.fillStyle = '#ece6d6'; x.fill();
  x.strokeStyle = 'rgba(128,128,128,.6)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, H / 2); x.lineTo(w, H / 2); x.stroke();
  A.cls.forEach((c, i) => {
    if (!c || !['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(c.cls) || !ev[i + 1]) return;
    x.fillStyle = CLASSES[c.cls].color; x.beginPath(); x.arc(X(i + 1), Y(ev[i + 1].wp), 3.5, 0, 7); x.fill();
  });
  x.strokeStyle = accent(); x.lineWidth = 2; x.beginPath(); x.moveTo(X(G.viewPly), 0); x.lineTo(X(G.viewPly), H); x.stroke();
  cv.onclick = e => { const r = cv.getBoundingClientRect(); goto(Math.round((e.clientX - r.left) / r.width * n)); };
}

function goto(p) {
  if (!G) return;
  if (G.scn) { stopScenario(false); G.viewPly = Math.max(0, Math.min(G.chess.history().length, p)); render(); return; }
  const n = G.chess.history().length;
  p = Math.max(0, Math.min(n, p));
  const cur = G.viewPly; if (p === cur) return;
  const h = hist();
  let o = {};
  if (p === cur + 1) { o = { move: h[p - 1] }; play(h[p - 1].san.includes('+') ? 'check' : h[p - 1].captured ? 'capture' : 'move'); }
  else if (p === cur - 1) o = { move: h[cur - 1], reverse: true };
  G.viewPly = p;
  render(o);
  const c = G.analysis?.cls[p - 1];
  if (o.move && !o.reverse && c && (c.cls === 'blunder' || c.cls === 'miss')) shake($('#board'));
}

// ---------- Ami en ligne ----------
function onlineHandlers() {
  return {
    open: () => { if (!online.isHost) online.send({ t: 'hello', name: store.d.name }); },
    data: onData,
    close: () => {
      if (G && G.mode === 'online') {
        G.connected = false;
        if (!G.over) endGame('none', 'Connexion perdue avec ton adversaire.');
        else { toast('Ton adversaire a quitté la partie.'); render(); }
      }
    },
    error: e => toast('Erreur de connexion : ' + (e.type || e.message))
  };
}

function onData(d) {
  switch (d.t) {
    case 'hello':
      if (online.isHost && (!G || G.mode !== 'online' || G.over)) hostStart(pickColor(), d.name);
      break;
    case 'busy':
      modal('<h2>Partie déjà en cours</h2><p class="muted">Ce lien est déjà utilisé par quelqu\'un d\'autre.</p><button class="btn" data-act="home">Menu</button>');
      break;
    case 'start':
      if (online.isHost || !['w', 'b'].includes(d.color)) return;
      history.replaceState(null, '', location.pathname);
      newGame({ mode: 'online', myColor: d.color, opp: { name: cleanName(d.name), elo: null, color: '#e57373' }, tc: tcOf(d.tc) });
      break;
    case 'move':
      if (!G || G.over || G.chess.turn() === G.myColor || typeof d.uci !== 'string') return;
      if (playMove({ from: d.uci.slice(0, 2), to: d.uci.slice(2, 4), promotion: d.uci[4] }, true) && d.clock && G.tc.base) {
        G.clock.w = +d.clock.w || 0; G.clock.b = +d.clock.b || 0; G.lastTick = performance.now(); renderClocks();
      }
      break;
    case 'resign': if (G && !G.over) endGame(G.myColor, 'Ton adversaire a abandonné.'); break;
    case 'flag': if (G && !G.over) timeout(other(G.myColor)); break;
    case 'draw-offer':
      if (!G || G.over) return;
      play('notify');
      modal(`<h2>Proposition de nulle</h2><p class="muted">${esc(G.opp.name)} propose la nulle.</p>
        <div class="btn-col"><button class="btn primary" data-act="drawYes">Accepter</button><button class="btn" data-act="drawNo">Refuser</button></div>`);
      break;
    case 'draw-yes': if (G && !G.over) endGame('draw', 'par accord mutuel'); break;
    case 'draw-no': toast('Nulle refusée'); break;
    case 'rematch':
      if (!G || !G.over) return;
      play('notify');
      modal(`<h2>Revanche ?</h2><p class="muted">${esc(G.opp.name)} te propose une revanche.</p>
        <div class="btn-col"><button class="btn primary" data-act="rematchYes">Accepter</button><button class="btn" data-act="rematchNo">Refuser</button></div>`);
      break;
    case 'rematch-yes': if (online.isHost && G) hostStart(other(G.myColor), G.opp.name); break;
    case 'rematch-no': toast('Revanche refusée'); break;
  }
}

function hostStart(hostColor, guestName) {
  const tc = tcOf(store.d.tc);
  online.send({ t: 'start', color: other(hostColor), tc: tc.id, name: store.d.name });
  newGame({ mode: 'online', myColor: hostColor, opp: { name: cleanName(guestName), elo: null, color: '#e57373' }, tc });
}

async function hostGame() {
  closeOnline();
  online = new Online(onlineHandlers());
  modal('<h2>Défier un ami</h2><p class="muted">Création du lien privé…</p><div class="spinner"></div>');
  try {
    const id = await online.host();
    hostLink = location.origin + location.pathname + '#j=' + id;
    const tc = tcOf(store.d.tc), col = COLORS.find(c => c.id === store.d.color);
    const wa = 'https://wa.me/?text=' + encodeURIComponent('Je te défie sur ChessM ♟️ Clique ici : ' + hostLink);
    modal(`<h2>Défier un ami</h2>
      <p>Envoie ce lien. La partie démarre dès que ton ami l'ouvre.<br><b>Garde cette page ouverte.</b></p>
      <input class="linkbox" readonly value="${esc(hostLink)}" onclick="this.select()">
      <div class="btn-row">
        <a class="btn wa" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <button class="btn" data-act="copyLink">Copier</button>
        ${navigator.share ? '<button class="btn" data-act="shareLink">Partager…</button>' : ''}
      </div>
      <p class="muted small">Cadence ${tc.label} (${tc.sub}) · Ta couleur : ${col.label}</p>
      <div class="waiting"><div class="spinner"></div><span>En attente de ton ami…</span></div>
      <button class="btn ghost" data-act="cancelHost">Annuler</button>`);
  } catch (e) {
    modal(`<h2>Impossible de créer le lien</h2><p class="muted">Vérifie ta connexion internet puis réessaie.</p><button class="btn" data-act="closeModal">OK</button>`);
    closeOnline();
  }
}

function joinFromHash() {
  const m = location.hash.match(/^#j=(echecs-[a-z0-9]{6,20})$/);
  if (!m) return;
  modal(`<h2>♟️ On t'a défié aux échecs !</h2><p class="muted">Choisis ton pseudo puis rejoins la partie.</p>
    <input class="linkbox" id="joinName" maxlength="16" value="${esc(store.d.name)}">
    <div class="btn-col"><button class="btn primary" data-act="join" data-id="${m[1]}">Rejoindre la partie</button>
    <button class="btn ghost" data-act="home">Plus tard</button></div>`);
}

async function join(id) {
  const n = cleanName($('#joinName')?.value);
  store.d.name = n; store.save(); renderHome();
  closeOnline();
  online = new Online(onlineHandlers());
  modal('<h2>Connexion…</h2><p class="muted">Connexion à la partie de ton ami.</p><div class="spinner"></div><button class="btn ghost" data-act="home">Annuler</button>');
  try { await online.join(id); }
  catch {
    if (online?.closed) return;
    history.replaceState(null, '', location.pathname);
    modal('<h2>Lien expiré</h2><p class="muted">Ton ami a peut-être fermé la page. Demande-lui un nouveau lien.</p><button class="btn" data-act="home">Menu</button>');
    closeOnline();
  }
}

function closeOnline() { if (online) { online.close(); online = null; } }

// ---------- Actions ----------
function goHome() {
  if (G && !G.over && G.chess.history().length >= 2) {
    if (!confirm('Quitter la partie ? Elle sera comptée comme abandonnée.')) return;
    resign(true);
  }
  closeOnline(); closeModal(); puzzles.close();
  G = null;
  history.replaceState(null, '', location.pathname);
  renderHome(); showScreen('home');
}
function resign(force) {
  if (!G || G.over) return;
  if (!force && !confirm('Abandonner la partie ?')) return;
  if (G.mode === 'online') online?.send({ t: 'resign' });
  endGame(other(G.myColor), 'par abandon');
}
function rematch() {
  if (!G || !G.over) return;
  if (G.mode === 'bot') {
    const bot = G.bot, col = store.d.color === 'r' ? other(G.myColor) : store.d.color;
    newGame({ mode: 'bot', bot, myColor: col, opp: { name: bot.name, elo: bot.elo, color: bot.color } });
  } else if (G.connected) { online.send({ t: 'rematch' }); closeModal(); toast('Revanche proposée…'); }
}

const ACT = {
  home: goHome,
  toggleSound: () => { store.d.sound = sound.enabled = !store.d.sound; store.save(); renderHome(); },
  tc: b => { store.d.tc = b.dataset.v; store.save(); renderHome(); },
  color: b => { store.d.color = b.dataset.v; store.save(); renderHome(); },
  theme: b => { store.d.theme = b.dataset.v; store.save(); applyTheme(); openSettings(); },
  accent: b => { store.d.prefs.accent = b.dataset.v; store.save(); applyTheme(); openSettings(); },
  settings: () => openSettings(),
  scnAlt: () => startScenario('alt'),
  scnNext: () => startScenario('next'),
  scnToggle: () => { const S = G?.scn; if (!S) return; if (S.playing) { S.playing = false; clearTimeout(S.timer); renderReview(); } else playScenario(); },
  scnPrev: () => scnStep(-1),
  scnFwd: () => scnStep(1),
  scnClose: () => stopScenario(),
  bot: b => startBot(+b.dataset.i),
  host: hostGame,
  cancelHost: () => { closeOnline(); closeModal(); },
  copyLink: () => { navigator.clipboard?.writeText(hostLink).then(() => toast('Lien copié !'), () => toast('Copie impossible : sélectionne le lien.')); },
  shareLink: () => navigator.share?.({ title: 'Défi ChessM', text: 'Je te défie sur ChessM ♟️', url: hostLink }).catch(() => {}),
  join: b => join(b.dataset.id),
  first: () => goto(0),
  prev: () => G?.scn ? scnStep(-1) : goto(G ? G.viewPly - 1 : 0),
  next: () => G?.scn ? scnStep(1) : goto(G ? G.viewPly + 1 : 0),
  last: () => goto(G ? G.chess.history().length : 0),
  goto: b => goto(+b.dataset.ply),
  flip: () => { if (!G) return; board.setOrientation(other(board.orientation)); render(); },
  resign: () => resign(false),
  abort: () => { if (G && !G.over) { G.over = true; goHome(); } },
  draw: () => { if (G && !G.over && G.connected) { online.send({ t: 'draw-offer' }); toast('Nulle proposée'); } },
  drawYes: () => { closeModal(); online?.send({ t: 'draw-yes' }); endGame('draw', 'par accord mutuel'); },
  drawNo: () => { closeModal(); online?.send({ t: 'draw-no' }); },
  rematch,
  rematchYes: () => { closeModal(); online?.send({ t: 'rematch-yes' }); if (online?.isHost && G) hostStart(other(G.myColor), G.opp.name); },
  rematchNo: () => { closeModal(); online?.send({ t: 'rematch-no' }); },
  review: () => { closeModal(); startAnalysis(); },
  pz: b => { if (G && !G.over && G.chess.history().length >= 2) return goHome(); closeModal(); closeOnline(); G = null; puzzles.open(b.dataset.mode); },
  pzHint: () => puzzles.hint(),
  pzSolution: () => puzzles.giveUp(),
  pzNext: () => puzzles.next(),
  pzSkip: () => puzzles.skip(),
  install: () => { if (installEvt) { installEvt.prompt(); installEvt = null; renderInstall(); } else modal(`<h2>📲 Installer l'appli</h2><p>Sur iPhone : touche <b>Partager</b> <span style="font-size:20px">⎙</span> puis <b>« Sur l'écran d'accueil »</b>.</p><p>Sur Android : menu <b>⋮</b> puis <b>« Installer l'application »</b>.</p><button class="btn" data-act="closeModal">OK</button>`); },
  closeModal
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  unlockAudio();
  ACT[b.dataset.act]?.(b, e);
});
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', e => {
  if (!G || e.target.tagName === 'INPUT') return;
  const k = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'first', ArrowDown: 'last' }[e.key];
  if (k) { e.preventDefault(); ACT[k](); }
});
$('#nameInput').addEventListener('change', e => { store.d.name = cleanName(e.target.value); store.save(); renderHome(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && (G?.over || puzzles.active || $('#modalBox .settings-modal'))) closeModal(); });

function openSettings() {
  const P = store.d.prefs, d = store.d;
  const tog = (k, label, desc, val) => `<label class="tog"><input type="checkbox" data-pref="${k}" ${val ? 'checked' : ''}><span class="knob"></span><span class="tl"><b>${label}</b><small>${desc}</small></span></label>`;
  modal(`<div class="settings-modal"><h2>Paramètres</h2>
    <h3>Couleur d'accent</h3>
    <div class="swatches">${ACCENTS.map(([n, c]) => `<button class="swatch ${P.accent.toLowerCase() === c ? 'on' : ''}" data-act="accent" data-v="${c}" title="${n}" aria-label="${n}" style="--c:${c}"></button>`).join('')}
      <label class="swatch custom ${ACCENTS.some(a => a[1] === P.accent.toLowerCase()) ? '' : 'on'}" title="Couleur libre"><input type="color" id="accentPick" value="${P.accent}" aria-label="Couleur libre"></label></div>
    <h3>Plateau</h3>
    <div class="chips">${THEMES.map(t => `<button class="chip-btn theme-${t.id} ${d.theme === t.id ? 'on' : ''}" data-act="theme" data-v="${t.id}"><i class="sw"></i>${t.label}</button>`).join('')}</div>
    <h3>Son & voix</h3>
    ${tog('sound', 'Effets sonores', 'Bruit des pièces et jingles', d.sound)}
    ${tog('voice', 'Voix', '« Échec ! », « En passant ! »…', P.voice)}
    ${tog('callouts', 'Annonces à l\'écran', 'Texte animé sur l\'échiquier', P.callouts)}
    <h3>Animations</h3>
    ${tog('anim', 'Animations des pièces', 'Glissement et rebond', P.anim)}
    ${tog('fx', 'Effets visuels', 'Confettis et secousses', P.fx)}
    <button class="btn primary wide" data-act="closeModal">Terminé</button></div>`);
  $('#accentPick').addEventListener('input', e => { P.accent = e.target.value; store.save(); applyTheme(); });
  $('#accentPick').addEventListener('change', () => openSettings());
  $('#modalBox').querySelectorAll('[data-pref]').forEach(i => i.addEventListener('change', () => {
    if (i.dataset.pref === 'sound') store.d.sound = i.checked; else P[i.dataset.pref] = i.checked;
    store.save(); applyTheme(); renderHome();
    if (i.dataset.pref === 'voice' && i.checked) speak('Voix activée');
  }));
}
window.addEventListener('resize', () => { if (G?.analysis) drawGraph(); drawSpark(); });
window.addEventListener('hashchange', joinFromHash);

// Pendule
let lastLow = 0;
setInterval(() => {
  if (!G || G.over || !G.tc.base || !G.clockRunning) return;
  const now = performance.now(), t = G.chess.turn();
  G.clock[t] -= now - G.lastTick; G.lastTick = now;
  if (G.clock[t] <= 0) {
    G.clock[t] = 0;
    if (G.mode === 'bot' || t === G.myColor) {
      if (G.mode === 'online') online?.send({ t: 'flag' });
      timeout(t);
    }
  }
  if (t === G.myColor && G.clock[t] < 10000 && now - lastLow > 1000 && G.clock[t] > 0) { lastLow = now; play('low'); }
  renderClocks();
}, 100);

const puzzles = createPuzzles({ $, store, toast, showScreen, modal, onChange: () => renderHome() });

// Appli installable (PWA)
let installEvt = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function renderInstall() { $('#installBtn').classList.toggle('hidden', standalone); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
renderInstall();

if (location.search.includes('debug')) window.__dbg = { get G() { return G; }, get PZ() { return puzzles.state; } };

applyTheme();
renderHome();
joinFromHash();

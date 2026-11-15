// Problèmes : du jour, entraînement classé, survie (3 vies), contre-la-montre (3 min)
// Base : lichess puzzle database (CC0)
import { Chess } from '../lib/chess.js';
import { Board } from './board.js?v=8';
import { update, shown, provisional } from './rating.js?v=8';
import { play } from './sound.js?v=8';
import { confetti, shake } from './fx.js?v=8';
import { ic } from './ui.js?v=8';

const THEMES = {
  mateIn1: 'Mat en 1', mateIn2: 'Mat en 2', mateIn3: 'Mat en 3', mateIn4: 'Mat en 4', mate: 'Mat',
  fork: 'Fourchette', pin: 'Clouage', skewer: 'Enfilade', hangingPiece: 'Pièce en prise', discoveredAttack: 'Attaque à la découverte',
  doubleCheck: 'Échec double', sacrifice: 'Sacrifice', backRankMate: 'Mat du couloir', smotheredMate: 'Mat à l\'étouffée',
  deflection: 'Déviation', attraction: 'Attraction', clearance: 'Dégagement', interference: 'Interception', intermezzo: 'Coup intermédiaire',
  trappedPiece: 'Pièce piégée', promotion: 'Promotion', underPromotion: 'Sous-promotion', exposedKing: 'Roi exposé', kingsideAttack: 'Attaque côté roi',
  queensideAttack: 'Attaque côté dame', quietMove: 'Coup tranquille', defensiveMove: 'Coup défensif', zugzwang: 'Zugzwang', xRayAttack: 'Rayon X',
  capturingDefender: 'Élimination du défenseur', advancedPawn: 'Pion avancé', endgame: 'Finale', middlegame: 'Milieu de partie', opening: 'Ouverture',
  rookEndgame: 'Finale de tours', pawnEndgame: 'Finale de pions', queenEndgame: 'Finale de dames', bishopEndgame: 'Finale de fous', knightEndgame: 'Finale de cavaliers',
  crushing: 'Écrasant', advantage: 'Avantage', equality: 'Égalisation', enPassant: 'En passant', castling: 'Roque', arabianMate: 'Mat arabe',
  anastasiaMate: 'Mat d\'Anastasie', bodenMate: 'Mat de Boden', doubleBishopMate: 'Mat des deux fous', dovetailMate: 'Mat en queue d\'aronde', hookMate: 'Mat du crochet'
};
const MODES = {
  daily: { title: 'Problème du jour', icon: 'calendar-days' },
  rated: { title: 'Entraînement', icon: 'target' },
  survival: { title: 'Survie', icon: 'heart' },
  chrono: { title: 'Contre-la-montre', icon: 'timer' }
};

let DB = null;
const loadDb = async () => (DB ||= await fetch('data/puzzles.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }));

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
export function currentStreak(daily) {
  if (!daily || !daily.last) return 0;
  return daily.last === dayKey() || daily.last === yesterday() ? daily.streak : 0;
}

export function createPuzzles({ $, store, toast, showScreen, modal, onChange }) {
  const board = new Board($('#pboard'), { onMove: mv => userMove(mv), coordsOut: true });
  let P = null, Z = null, timer = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pick(target) {
    for (const spread of [60, 120, 250, 600, 3000]) {
      const c = DB.filter(p => Math.abs(p[3] - target) <= spread && !P.used.has(p[0]));
      if (c.length) return c[Math.floor(Math.random() * c.length)];
    }
    return DB[Math.floor(Math.random() * DB.length)];
  }
  function dailyPuzzle() {
    const k = dayKey(); let h = 2166136261;
    for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const pool = DB.filter(p => p[3] >= 1000 && p[3] <= 1700);
    return pool[h % pool.length];
  }

  async function open(mode) {
    close();
    showScreen('puzzle');
    $('#pzStatus').textContent = 'Chargement des problèmes…';
    try { await loadDb(); } catch { toast('Impossible de charger les problèmes.'); return; }
    P = { mode, lives: 3, score: 0, errors: 0, used: new Set(), over: false, endAt: mode === 'chrono' ? performance.now() + 180000 : 0 };
    if (mode === 'chrono') timer = setInterval(tick, 200);
    next();
  }
  function close() { clearInterval(timer); timer = null; P = null; Z = null; }

  function next() {
    if (!P || P.over) return;
    const pz = P.mode === 'daily' ? dailyPuzzle()
      : P.mode === 'rated' ? pick(store.d.ratings.puzzle.r)
      : pick(450 + P.score * (P.mode === 'chrono' ? 45 : 65));
    load(pz);
  }

  function load(pz) {
    const [id, fen, moves] = pz;
    P.used.add(id);
    const chess = new Chess(fen);
    Z = { pz, chess, sol: moves.split(' '), step: 0, color: chess.turn() === 'w' ? 'b' : 'w', failed: false, solved: false, hinted: false, rated: false, done: false, busy: true, delta: null, id: Math.random() };
    board.setOrientation(Z.color);
    board.setPosition(fen, {});
    board.setArrows([]); board.setBadge(null);
    render();
    later(650, () => { autoMove(); Z.busy = false; render(); });
  }
  function later(ms, fn) { const id = Z.id; setTimeout(() => { if (Z && Z.id === id && P) fn(); }, ms); }

  const checkSq = () => Z.chess.inCheck() ? Z.chess.board().flat().find(x => x && x.type === 'k' && x.color === Z.chess.turn())?.square : null;
  const lastMove = () => Z.chess.history({ verbose: true }).slice(-1)[0] || null;
  const snd = m => play(Z.chess.inCheck() ? 'check' : m.captured ? 'capture' : /[kq]/.test(m.flags) ? 'castle' : 'move');
  function show(m, reverse = false) { board.setPosition(Z.chess.fen(), { move: m, reverse, lastMove: lastMove(), check: checkSq() }); }

  function autoMove() {
    const u = Z.sol[Z.step];
    const m = Z.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    Z.step++; show(m); snd(m);
  }

  function userMove(mv) {
    if (!Z || Z.busy || Z.done) return;
    let m; try { m = Z.chess.move(mv); } catch { return; }
    const ok = m.lan === Z.sol[Z.step] || Z.chess.isCheckmate();
    show(m); snd(m);
    if (ok) {
      Z.step++;
      board.flash(m.to, 'good', 700);
      if (Z.step >= Z.sol.length || Z.chess.isCheckmate()) return solved();
      Z.busy = true; render();
      later(450, () => { autoMove(); Z.busy = false; render(); });
    } else {
      play('error'); board.flash(m.to, 'bad', 900); shake($('#pboard'));
      Z.busy = true; render();
      later(650, () => { Z.chess.undo(); show(m, true); failed(); });
    }
  }

  function rate(s) {
    if (Z.rated) return;
    Z.rated = true;
    const daily = store.d.daily;
    if (P.mode === 'rated' || (P.mode === 'daily' && !daily.done[dayKey()])) {
      Z.delta = update(store.d.ratings.puzzle, Z.pz[3], 75, s);
      store.save(); onChange();
    }
  }
  function recordDaily(ok) {
    const d = store.d.daily, k = dayKey();
    if (d.done[k]) return;
    d.done[k] = ok ? 'ok' : 'fail';
    if (ok) d.streak = d.last === yesterday() || d.last === k ? d.streak + 1 : 1;
    else d.streak = 0;
    d.best = Math.max(d.best, d.streak); d.last = k;
    const keys = Object.keys(d.done).sort(); while (keys.length > 60) delete d.done[keys.shift()];
    store.save(); onChange();
  }

  function failed() {
    const first = !Z.failed;
    Z.failed = true;
    if (first) rate(0);
    if (P.mode === 'survival') {
      P.lives--;
      solution(() => { if (P.lives <= 0) endSession(); else next(); });
    } else if (P.mode === 'chrono') {
      P.errors++; P.endAt -= 10000; Z.done = true; render();
      later(400, next);
    } else { Z.busy = false; render(); }
  }

  function solved() {
    Z.solved = Z.done = true; Z.busy = false;
    play('success');
    if (!Z.failed && !Z.hinted) rate(1);
    if (P.mode === 'daily') { recordDaily(true); confetti(80); }
    if (P.mode === 'survival' || P.mode === 'chrono') { P.score++; render(); later(700, next); return; }
    render();
  }

  // Joue la solution restante coup par coup
  function solution(after) {
    Z.done = true; Z.busy = true; render();
    const stepFn = () => {
      if (Z.step >= Z.sol.length) { Z.busy = false; render(); if (after) later(700, after); return; }
      autoMove(); later(650, stepFn);
    };
    later(300, stepFn);
  }

  function tick() {
    if (!P || P.over) return;
    if (performance.now() >= P.endAt) { endSession(); return; }
    const el = $('#pzClock'); if (el) el.textContent = fmt(P.endAt - performance.now());
  }
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function endSession() {
    P.over = true; clearInterval(timer);
    if (Z) { Z.done = true; Z.busy = false; }
    const b = store.d.best, key = P.mode, rec = P.score > (b[key] || 0);
    if (rec) { b[key] = P.score; store.save(); onChange(); }
    play(rec && P.score > 0 ? 'win' : 'end');
    if (rec && P.score > 0) confetti();
    render();
    modal(`<div class="end-icon">${ic(rec && P.score > 0 ? 'trophy' : 'puzzle')}</div><h2>${P.mode === 'chrono' ? 'Temps écoulé !' : 'Plus de vies !'}</h2>
      <p class="score-big">${P.score} <small>problème${P.score > 1 ? 's' : ''} réussi${P.score > 1 ? 's' : ''}</small></p>
      <p class="muted">${rec && P.score > 0 ? 'Nouveau record personnel !' : `Record : ${b[key] || 0}`}</p>
      <div class="btn-col"><button class="btn primary" data-act="pz" data-mode="${P.mode}">${ic('refresh-cw')} Rejouer</button><button class="btn ghost" data-act="home">Menu principal</button></div>`);
  }

  function render() {
    if (!P || !Z) return;
    board.setInteractive(!Z.busy && !Z.done && !P.over ? Z.color : null, sq => Z.chess.moves({ square: sq, verbose: true }));
    const side = Z.color === 'w' ? 'Blancs' : 'Noirs';
    const mate = Z.pz[4].match(/mateIn(\d)/);
    let status;
    if (Z.solved) status = '<b class="ok">Bravo, c\'est réussi !</b>';
    else if (Z.done && Z.failed) status = '<b class="ko">Voici la solution</b>';
    else if (Z.failed) status = '<b class="ko">Ce n\'est pas le bon coup. Réessaie !</b>';
    else if (Z.busy && Z.step === 0) status = '<span class="muted">Regarde le coup de l\'adversaire…</span>';
    else status = `<span class="turn ${Z.color}"></span> Trouve le meilleur coup pour les <b>${side}</b>${mate ? ` — <b>mat en ${mate[1]}</b>` : ''}`;
    $('#pzStatus').innerHTML = status;

    let stats = '';
    const R = store.d.ratings.puzzle;
    if (P.mode === 'survival') stats = `<span class="hearts" aria-label="${P.lives} vie${P.lives > 1 ? 's' : ''}">${ic('heart', 'full').repeat(P.lives)}${ic('heart', 'lost').repeat(3 - P.lives)}</span><span class="pz-score">${P.score}</span>`;
    else if (P.mode === 'chrono') stats = `<span class="pz-clock" id="pzClock">${fmt(P.endAt - performance.now())}</span><span class="pz-score">${P.score}</span>${P.errors ? `<span class="ko">✗${P.errors}</span>` : ''}`;
    else if (P.mode === 'rated') stats = `<span class="pz-rating">${ic('puzzle')} ${shown(R)}${provisional(R) ? '?' : ''}${Z.delta != null ? ` <i class="${Z.delta >= 0 ? 'up' : 'down'}">${Z.delta >= 0 ? '+' : ''}${Z.delta}</i>` : ''}</span>`;
    else stats = `<span class="pz-streak" title="Série de jours">${ic('flame')} ${currentStreak(store.d.daily)}</span>`;
    $('#pzTop').innerHTML = `<b>${ic(MODES[P.mode].icon)} ${MODES[P.mode].title}</b><div class="pz-stats">${stats}</div>`;

    const themes = Z.pz[4].split(' ').map(t => THEMES[t]).filter(Boolean);
    const daily = P.mode === 'daily' ? store.d.daily.done[dayKey()] : null;
    $('#pzPanel').innerHTML = `
      <div class="pz-info"><span>Difficulté</span><b>${P.mode === 'survival' || P.mode === 'chrono' ? '—' : Z.pz[3]}</b></div>
      ${Z.done ? `<div class="pz-themes">${themes.map(t => `<span>${t}</span>`).join('')}</div>` : '<p class="muted small">Les thèmes du problème s\'affichent une fois terminé.</p>'}
      ${P.mode === 'daily' ? `<p class="muted small">${daily ? 'Problème du jour déjà joué — reviens demain pour le suivant !' : 'Un nouveau problème chaque jour, le même pour toute la famille. Réussis-le pour garder ta série.'}</p>` : ''}
      ${P.mode === 'survival' ? '<p class="muted small">Les problèmes deviennent de plus en plus durs. 3 erreurs et c\'est fini !</p>' : ''}
      ${P.mode === 'chrono' ? '<p class="muted small">Un maximum de problèmes en 3 minutes. Chaque erreur coûte 10 secondes.</p>' : ''}
      <a class="muted small" href="https://lichess.org/training/${esc(Z.pz[0])}" target="_blank" rel="noopener noreferrer">Problème n° ${esc(Z.pz[0])} (base lichess)</a>`;

    const acts = [];
    if (!Z.done && !P.over && P.mode !== 'chrono') acts.push(`<button class="btn" data-act="pzHint">${ic('lightbulb')} Indice</button>`, `<button class="btn" data-act="pzSolution">${ic('eye')} Solution</button>`);
    if (Z.done && P.mode === 'rated') acts.push(`<button class="btn primary" data-act="pzNext">Suivant ${ic('chevron-right')}</button>`);
    if (Z.done && P.mode === 'daily') acts.push(`<button class="btn primary" data-act="pz" data-mode="rated">${ic('target')} S'entraîner</button>`);
    if (P.mode === 'chrono' && !P.over) acts.push(`<button class="btn" data-act="pzSkip">Passer ${ic('skip-forward')}</button>`);
    acts.push('<button class="btn ghost" data-act="home">Menu</button>');
    $('#pzActions').innerHTML = acts.join('');
  }

  function hint() {
    if (!Z || Z.done || Z.busy) return;
    Z.hinted = true;
    board.flash(Z.sol[Z.step].slice(0, 2), 'hint', 1600);
  }
  function giveUp() {
    if (!Z || Z.done || Z.busy) return;
    if (!Z.failed) { Z.failed = true; rate(0); }
    if (P.mode === 'daily') recordDaily(false);
    if (P.mode === 'survival') { P.lives--; solution(() => { if (P.lives <= 0) endSession(); else next(); }); }
    else solution();
  }
  function skip() { if (P && !P.over && Z && !Z.busy) { P.errors++; P.endAt -= 10000; next(); } }

  return { open, close, next, hint, giveUp, skip, get active() { return !!P; }, get state() { return { P, Z }; } };
}

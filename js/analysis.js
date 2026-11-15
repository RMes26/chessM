// Analyse de partie : évaluations, classification des coups, précision
import { Chess } from '../lib/chess.js';

export const CLASSES = {
  brilliant:  { label: 'Brillant',          sym: '!!', color: '#1baca6' },
  great:      { label: 'Très bon coup',     sym: '!',  color: '#5c8bb0' },
  best:       { label: 'Meilleur coup',     sym: '★',  color: '#81b64c' },
  excellent:  { label: 'Excellent',         sym: '👍', color: '#96bc4b' },
  good:       { label: 'Bon coup',          sym: '✓',  color: '#97af8b' },
  inaccuracy: { label: 'Imprécision',       sym: '?!', color: '#f0c15c' },
  mistake:    { label: 'Erreur',            sym: '?',  color: '#e6912c' },
  miss:       { label: 'Occasion manquée',  sym: '✗',  color: '#ee6b55' },
  blunder:    { label: 'Gaffe',             sym: '??', color: '#ca3431' }
};

const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

export function evalText(ev) {
  if (!ev) return '';
  if (ev.mate === 0) return '#';
  if (ev.mate != null) return 'M' + Math.abs(ev.mate);
  const v = ev.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

async function evalPosition(engine, fen, opts) {
  const c = new Chess(fen), turn = c.turn();
  if (c.isCheckmate()) return { wp: turn === 'w' ? 0 : 100, cp: turn === 'w' ? -10000 : 10000, mate: 0, best: null, secondWp: null };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { wp: 50, cp: 0, mate: null, best: null, secondWp: null };
  const r = await engine.search(fen, { depth: opts.depth, movetime: opts.movetime, multipv: 2, options: { UCI_LimitStrength: false } });
  const s = turn === 'w' ? 1 : -1;
  const conv = l => {
    if (!l) return null;
    if (l.mate != null) { const m = l.mate * s; return { mate: m, cp: m > 0 ? 10000 - Math.abs(m) * 10 : -10000 + Math.abs(m) * 10, wp: m > 0 ? 100 : 0 }; }
    const cp = l.cp * s; return { mate: null, cp, wp: winPct(cp) };
  };
  const a = conv(r.lines[0]) || { cp: 0, mate: null, wp: 50 };
  const b = conv(r.lines[1]);
  return { ...a, best: r.bestmove, secondWp: b ? b.wp : null };
}

// Sacrifice : pièce (≥ cavalier) laissée en prise sans compensation immédiate
function isSacrifice(m) {
  const t = m.promotion || m.piece;
  if (V[t] < 3) return false;
  const gain = m.captured ? V[m.captured] : 0;
  if (V[t] - gain < 2) return false;
  const c = new Chess(m.after);
  const opp = m.color === 'w' ? 'b' : 'w';
  const att = c.attackers(m.to, opp);
  if (!att.length) return false;
  const def = c.attackers(m.to, m.color);
  if (att.every(sq => c.get(sq).type === 'k') && def.length) return false;
  const minAtt = Math.min(...att.map(sq => V[c.get(sq).type]));
  return !def.length || minAtt < V[t];
}

function classifyMove(m, evB, evA, prevCls, prevMove) {
  const pov = wp => (m.color === 'w' ? wp : 100 - wp);
  const before = pov(evB.wp), after = pov(evA.wp);
  const loss = Math.max(0, before - after);
  const isBest = evB.best === m.lan;
  const acc = clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100);
  const legalCount = new Chess(m.before).moves().length;
  const recapture = prevMove && prevMove.captured && prevMove.to === m.to;
  let cls;
  if (loss <= 2 && before < 97 && after >= 45 && isSacrifice(m)) cls = 'brilliant';
  else if (isBest && legalCount > 1 && !recapture && evB.secondWp != null && before - pov(evB.secondWp) >= 20 && before < 97) cls = 'great';
  else if (isBest || legalCount === 1) cls = 'best';
  else if (loss <= 2) cls = 'excellent';
  else if (loss <= 5) cls = 'good';
  else if (loss <= 10) cls = 'inaccuracy';
  else if (['mistake', 'blunder', 'miss'].includes(prevCls) && after >= 40) cls = 'miss';
  else if (loss <= 20) cls = 'mistake';
  else cls = 'blunder';
  return { cls, loss, acc };
}

// Analyse progressive : onUpdate(res) appelé après chaque position
export async function analyseGame(engine, startFen, moves, onUpdate, isCancelled, opts = { depth: 13, movetime: 1200 }) {
  const fens = [startFen, ...moves.map(m => m.after)];
  const res = { evals: [], cls: [], progress: 0, done: false, acc: { w: null, b: null }, counts: { w: {}, b: {} } };
  for (let i = 0; i < fens.length; i++) {
    if (isCancelled()) return null;
    res.evals[i] = await evalPosition(engine, fens[i], opts);
    if (i > 0) {
      const k = i - 1;
      res.cls[k] = classifyMove(moves[k], res.evals[k], res.evals[i], res.cls[k - 1]?.cls, moves[k - 1]);
    }
    res.progress = (i + 1) / fens.length;
    if (isCancelled()) return null;
    onUpdate(res);
  }
  for (const col of ['w', 'b']) {
    const list = res.cls.filter((c, i) => moves[i].color === col);
    res.acc[col] = list.length ? list.reduce((a, c) => a + c.acc, 0) / list.length : null;
    for (const c of list) res.counts[col][c.cls] = (res.counts[col][c.cls] || 0) + 1;
  }
  res.done = true;
  onUpdate(res);
  return res;
}

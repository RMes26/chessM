// Wrapper UCI minimal autour de Stockfish (Web Worker) + logique des bots
import { Chess } from '../lib/chess.js';

export class Engine {
  constructor(path = 'lib/stockfish-18-lite-single.js') {
    this.path = path; this.w = null; this.readyP = null; this.handler = null;
    this.q = Promise.resolve(); this.opts = {};
  }
  get ready() { return !!this._isReady; }
  start() {
    if (!this.readyP) {
      this.readyP = new Promise((res, rej) => {
        try { this.w = new Worker(this.path); } catch (e) { return rej(e); }
        this.w.onmessage = e => { const l = typeof e.data === 'string' ? e.data : ''; if (this.handler) this.handler(l); };
        this.w.onerror = e => rej(new Error(e.message || 'Moteur indisponible'));
        this._wait('uci', 'uciok').then(() => this._wait('isready', 'readyok')).then(() => { this._isReady = true; res(); }, rej);
      });
      this.readyP.catch(() => { this.readyP = null; });
    }
    return this.readyP;
  }
  _wait(cmd, token) {
    return new Promise(res => {
      this.handler = l => { if (l.startsWith(token)) { this.handler = null; res(l); } };
      this.w.postMessage(cmd);
    });
  }
  _run(task) { const p = this.q.then(() => this.start()).then(task); this.q = p.catch(() => {}); return p; }
  _opt(n, v) { if (this.opts[n] === v) return; this.opts[n] = v; this.w.postMessage(`setoption name ${n} value ${v}`); }
  newGame() { return this._run(() => { this.w.postMessage('ucinewgame'); return this._wait('isready', 'readyok'); }); }

  // Retourne { bestmove, lines:[{cp|mate (point de vue du trait), pv}] }
  search(fen, { depth, movetime, multipv = 1, options = {} } = {}) {
    return this._run(async () => {
      for (const k in options) this._opt(k, options[k]);
      this._opt('MultiPV', multipv);
      await this._wait('isready', 'readyok');
      return new Promise(res => {
        const lines = [];
        this.handler = l => {
          if (l.startsWith('info ') && l.includes(' pv ') && !l.includes('bound')) {
            const t = l.split(' ');
            const g = k => { const i = t.indexOf(k); return i < 0 ? null : t[i + 1]; };
            const s = t.indexOf('score');
            if (s < 0) return;
            const kind = t[s + 1], val = +t[s + 2];
            lines[(+(g('multipv') || 1)) - 1] = {
              depth: +g('depth'), cp: kind === 'cp' ? val : null, mate: kind === 'mate' ? val : null,
              pv: t.slice(t.indexOf('pv') + 1)
            };
          } else if (l.startsWith('bestmove')) {
            this.handler = null;
            const bm = l.split(' ')[1];
            res({ bestmove: bm && bm !== '(none)' ? bm : null, lines: lines.filter(Boolean) });
          }
        };
        this.w.postMessage('position fen ' + fen);
        let go = 'go';
        if (depth) go += ' depth ' + depth;
        if (movetime) go += ' movetime ' + movetime;
        this.w.postMessage(go);
      });
    });
  }
}

// Coup d'un bot selon son niveau Elo
export async function botMove(engine, fen, bot, timeLeft) {
  const cap = timeLeft != null ? Math.max(60, timeLeft / 25) : Infinity;
  if (bot.elo >= 1400) {
    const full = bot.elo >= 3000;
    const r = await engine.search(fen, {
      movetime: Math.round(Math.min(full ? 1500 : 700, cap)),
      options: { UCI_LimitStrength: !full, UCI_Elo: Math.min(3190, Math.max(1320, bot.elo)) }
    });
    return r.bestmove;
  }
  // Petits niveaux : recherche courte + choix pondéré parmi plusieurs coups + erreurs aléatoires
  const P = bot.elo <= 500 ? { d: 1, T: 300, r: 0.30 }
    : bot.elo <= 800 ? { d: 2, T: 160, r: 0.15 }
    : bot.elo <= 1100 ? { d: 4, T: 80, r: 0.07 }
    : { d: 6, T: 40, r: 0.03 };
  const r = await engine.search(fen, { depth: P.d, multipv: 5, options: { UCI_LimitStrength: false } });
  const legal = new Chess(fen).moves({ verbose: true });
  if (!legal.length) return null;
  if (!r.lines.length || Math.random() < P.r) return legal[Math.floor(Math.random() * legal.length)].lan;
  const sc = l => l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : l.cp;
  const best = sc(r.lines[0]);
  const ws = r.lines.map(l => Math.exp(-(best - sc(l)) / P.T));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return r.lines[i].pv[0]; }
  return r.lines[0].pv[0];
}

// Échiquier : rendu, animations, glisser-déposer / toucher, promotion, flèches, badges
const FILES = 'abcdefgh';
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const pieceCls = p => `pc piece ${NAMES[p.type]} ${p.color === 'w' ? 'white' : 'black'}`;

export class Board {
  constructor(el, { onMove }) {
    this.el = el; this.onMove = onMove;
    this.orientation = 'w'; this.pieces = new Map(); this.position = new Map();
    this.selected = null; this.dests = new Set(); this.interactive = null; this.legalFn = () => [];
    this.arrows = []; this.badge = null; this.hl = {};
    el.classList.add('board');
    el.innerHTML = `<div class="sqs"></div><div class="pcs"></div>
      <svg class="arrows" viewBox="0 0 8 8"><defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 z" fill="context-stroke"/></marker></defs><g></g></svg>
      <div class="badge-wrap hidden"><span class="badge"></span></div><div class="ghostpc hidden"></div>
      <div class="callout hidden"><span class="co-icon"></span><span class="co-text"></span></div><div class="promo hidden"></div>`;
    this.sqs = el.querySelector('.sqs'); this.pcs = el.querySelector('.pcs');
    this.svg = el.querySelector('.arrows g'); this.badgeEl = el.querySelector('.badge-wrap'); this.promoEl = el.querySelector('.promo');
    this.ghostEl = el.querySelector('.ghostpc'); this.coEl = el.querySelector('.callout'); this.ghost = null;
    this.buildSquares();
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointercancel', () => this.cancelDrag());
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  xy(sq) { const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r]; }
  sqAt(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const f = this.orientation === 'w' ? x : 7 - x, r = this.orientation === 'w' ? 7 - y : y;
    return FILES[f] + (r + 1);
  }
  sqFromEvent(e) {
    const r = this.el.getBoundingClientRect();
    return this.sqAt(Math.floor((e.clientX - r.left) / r.width * 8), Math.floor((e.clientY - r.top) / r.height * 8));
  }
  place(el, sq) { const [x, y] = this.xy(sq); el.style.translate = `${x * 100}% ${y * 100}%`; }

  buildSquares() {
    let h = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this.sqAt(x, y), light = (sq.charCodeAt(0) - 97 + +sq[1] - 1) % 2 === 1;
      h += `<div class="sq ${light ? 'light' : 'dark'}" data-sq="${sq}">${x === 0 ? `<span class="rk">${sq[1]}</span>` : ''}${y === 7 ? `<span class="fl">${sq[0]}</span>` : ''}</div>`;
    }
    this.sqs.innerHTML = h;
    this.sqEls = {};
    this.sqs.querySelectorAll('.sq').forEach(d => { this.sqEls[d.dataset.sq] = d; });
  }

  setOrientation(c) {
    if (c === this.orientation) return;
    this.orientation = c; this.buildSquares();
    this.pcs.querySelectorAll('.pc').forEach(el => el.classList.add('snap'));
    for (const [sq, el] of this.pieces) this.place(el, sq);
    requestAnimationFrame(() => this.pcs.querySelectorAll('.snap').forEach(el => el.classList.remove('snap')));
    this.applyHighlights(); this.drawArrows(); this.drawBadge(); this.drawGhost();
  }

  parseFen(fen) {
    const m = new Map(); const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        m.set(FILES[f] + (8 - i), { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
        f++;
      }
    });
    return m;
  }

  // o: { move, reverse, lastMove, check }
  setPosition(fen, o = {}) {
    const want = this.parseFen(fen);
    const m = o.move;
    let movedEl = null;
    if (m) {
      const from = o.reverse ? m.to : m.from, to = o.reverse ? m.from : m.to;
      const el = this.pieces.get(from);
      if (el) {
        if (!o.reverse) {
          const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : to;
          const cap = this.pieces.get(capSq);
          if (cap && cap !== el) { this.pieces.delete(capSq); cap.classList.add('captured'); setTimeout(() => cap.remove(), 260); }
        }
        this.pieces.delete(from);
        const old = this.pieces.get(to); if (old && old !== el) old.remove();
        this.pieces.set(to, el); this.place(el, to); movedEl = el;
        if (!o.reverse) {
          clearTimeout(el._land);
          el._land = setTimeout(() => { el.classList.add('land'); setTimeout(() => el.classList.remove('land'), 220); }, el.classList.contains('snap') ? 0 : 160);
        }
        if (m.flags.includes('k') || m.flags.includes('q')) {
          const r = m.from[1], k = m.flags.includes('k');
          let rf = (k ? 'h' : 'a') + r, rt = (k ? 'f' : 'd') + r;
          if (o.reverse) [rf, rt] = [rt, rf];
          const rel = this.pieces.get(rf);
          if (rel) { this.pieces.delete(rf); this.pieces.set(rt, rel); this.place(rel, rt); }
        }
      }
    }
    for (const [sq, el] of this.pieces) {
      const w = want.get(sq);
      if (!w) { el.remove(); this.pieces.delete(sq); }
      else if (el.dataset.p !== w.color + w.type) { el.className = pieceCls(w); el.dataset.p = w.color + w.type; }
    }
    for (const [sq, w] of want) {
      if (this.pieces.has(sq)) continue;
      const el = document.createElement('div');
      el.className = pieceCls(w); el.dataset.p = w.color + w.type;
      this.place(el, sq); this.pcs.appendChild(el); this.pieces.set(sq, el);
    }
    this.position = want;
    if (!o.ghost) this.pcs.querySelectorAll('.pc.ghost').forEach(e => e.classList.remove('ghost'));
    else if (movedEl) movedEl.classList.add('ghost');
    this.el.classList.toggle('scenario', !!o.ghost);
    this.hl = { last: o.lastMove ? [o.lastMove.from, o.lastMove.to] : [], check: o.check || null };
    this.deselect();
    this.applyHighlights();
  }

  applyHighlights() {
    for (const d of Object.values(this.sqEls)) d.classList.remove('last', 'check', 'sel', 'dest', 'cap');
    (this.hl.last || []).forEach(s => this.sqEls[s]?.classList.add('last'));
    if (this.hl.check) this.sqEls[this.hl.check]?.classList.add('check');
    if (this.selected) {
      this.sqEls[this.selected].classList.add('sel');
      for (const s of this.dests) this.sqEls[s].classList.add('dest', ...(this.position.has(s) ? ['cap'] : []));
    }
  }

  setInteractive(color, legalFn) {
    this.interactive = color; if (legalFn) this.legalFn = legalFn;
    if (!color) { this.deselect(); this.applyHighlights(); }
    this.el.classList.toggle('active', !!color);
  }

  select(sq) {
    this.selected = sq;
    this.dests = new Set(this.legalFn(sq).map(m => m.to));
    this.applyHighlights();
  }
  deselect() { this.selected = null; this.dests = new Set(); }

  down(e) {
    if (e.button > 0 || !this.promoEl.classList.contains('hidden')) return;
    const sq = this.sqFromEvent(e); if (!sq) return;
    if (this.selected && this.dests.has(sq)) { e.preventDefault(); this.tryMove(this.selected, sq); return; }
    const p = this.position.get(sq);
    if (this.interactive && p && p.color === this.interactive) {
      const was = this.selected === sq;
      this.select(sq);
      this.drag = { sq, el: this.pieces.get(sq), was, x: e.clientX, y: e.clientY, moved: false };
      try { this.el.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    } else { this.deselect(); this.applyHighlights(); }
  }
  move(e) {
    const d = this.drag; if (!d || !d.el) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const r = this.el.getBoundingClientRect(), s = r.width / 8;
    d.el.classList.add('dragging');
    d.el.style.translate = `${e.clientX - r.left - s / 2}px ${e.clientY - r.top - s / 2}px`;
  }
  up(e) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.el) d.el.classList.remove('dragging');
    const sq = this.sqFromEvent(e);
    if (d.moved) {
      if (sq && sq !== d.sq && this.dests.has(sq)) {
        d.el.classList.add('snap'); this.place(d.el, sq);
        this.tryMove(d.sq, sq);
        requestAnimationFrame(() => requestAnimationFrame(() => d.el.classList.remove('snap')));
      } else {
        this.place(d.el, d.sq);
        if (sq !== d.sq) { this.deselect(); this.applyHighlights(); }
      }
    } else if (d.was) { this.deselect(); this.applyHighlights(); }
  }
  cancelDrag() { const d = this.drag; this.drag = null; if (d && d.el) { d.el.classList.remove('dragging'); this.place(d.el, d.sq); } }

  tryMove(from, to) {
    const ms = this.legalFn(from).filter(m => m.to === to);
    if (!ms.length) return;
    if (ms[0].promotion) {
      this.askPromo(ms[0].color).then(p => {
        if (p) this.onMove({ from, to, promotion: p });
        else { const el = this.pieces.get(from); if (el) this.place(el, from); this.deselect(); this.applyHighlights(); }
      });
    } else this.onMove({ from, to });
  }

  askPromo(color) {
    return new Promise(res => {
      const c = color === 'w' ? 'white' : 'black';
      this.promoEl.innerHTML = ['q', 'n', 'r', 'b'].map(t => `<button class="piece ${NAMES[t]} ${c}" data-p="${t}" aria-label="${t}"></button>`).join('');
      this.promoEl.classList.remove('hidden');
      const done = v => { this.promoEl.classList.add('hidden'); this.promoEl.onpointerdown = null; res(v); };
      this.promoEl.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); done(e.target.dataset?.p || null); };
    });
  }

  flash(sq, cls, ms = 1000) {
    const d = this.sqEls[sq]; if (!d) return;
    d.classList.add(cls); setTimeout(() => d.classList.remove(cls), ms);
  }

  setArrows(list) { this.arrows = list || []; this.drawArrows(); }
  drawArrows() {
    this.svg.innerHTML = this.arrows.map(a => {
      const [x1, y1] = this.xy(a.from), [x2, y2] = this.xy(a.to);
      const cx1 = x1 + .5, cy1 = y1 + .5, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const cx2 = x2 + .5 - dx / L * .35, cy2 = y2 + .5 - dy / L * .35;
      return `<line x1="${cx1}" y1="${cy1}" x2="${cx2}" y2="${cy2}" stroke="${a.color}" stroke-width=".17" stroke-linecap="round" marker-end="url(#ah)" opacity=".85"/>`;
    }).join('');
  }

  // Pièce fantôme : copie translucide de la pièce de `from` posée sur `to`
  setGhost(g) { this.ghost = g; this.drawGhost(); }
  drawGhost() {
    const g = this.ghost, p = g && (g.piece || this.position.get(g.from));
    this.ghostEl.classList.toggle('hidden', !p);
    if (!p) return;
    this.ghostEl.className = `ghostpc pc piece ${NAMES[g.promotion || p.type]} ${p.color === 'w' ? 'white' : 'black'}`;
    this.place(this.ghostEl, g.to);
  }

  // Annonce animée au centre de l'échiquier
  callout(text, icon = '') {
    const c = this.coEl;
    c.querySelector('.co-icon').textContent = icon;
    c.querySelector('.co-text').textContent = text;
    c.classList.remove('hidden', 'show'); void c.offsetWidth; c.classList.add('show');
    clearTimeout(this._co); this._co = setTimeout(() => c.classList.add('hidden'), 1600);
  }

  setBadge(b) { this.badge = b; this.drawBadge(); }
  drawBadge() {
    const b = this.badge;
    this.badgeEl.classList.toggle('hidden', !b);
    if (!b) return;
    this.place(this.badgeEl, b.sq);
    const s = this.badgeEl.firstChild;
    s.textContent = b.sym; s.style.background = b.color;
  }
}

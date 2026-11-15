// Classement Glicko-2 (comme lichess) : une note par catégorie
const SC = 173.7178, TAU = 0.5;

export const CATS = {
  bullet: { label: 'Bullet', icon: '⚡' },
  blitz: { label: 'Blitz', icon: '🔥' },
  rapide: { label: 'Rapide', icon: '🐇' },
  classique: { label: 'Classique', icon: '🐢' },
  puzzle: { label: 'Problèmes', icon: '🧩' }
};

export const newRating = (r = 1000, rd = 250) => ({ r, rd, vol: 0.06, n: 0, hist: [Math.round(r)] });
export const shown = p => Math.round(p.r);
export const provisional = p => p.rd > 110;

// Catégorie selon la cadence (durée estimée = base + 40 × incrément)
export function catOf(tc) {
  if (!tc || !tc.base) return 'classique';
  const t = tc.base + 40 * tc.inc;
  return t < 180 ? 'bullet' : t < 480 ? 'blitz' : 'rapide';
}

// Met à jour p après un résultat s (1, 0.5, 0) contre (oppR, oppRd). Retourne la variation affichée.
export function update(p, oppR, oppRd, s) {
  const mu = (p.r - 1500) / SC, phi = p.rd / SC, muj = (oppR - 1500) / SC, phij = oppRd / SC;
  const g = 1 / Math.sqrt(1 + 3 * phij * phij / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muj)));
  const v = 1 / (g * g * E * (1 - E));
  const dl = v * g * (s - E);
  const a = Math.log(p.vol * p.vol);
  const f = x => { const ex = Math.exp(x); return ex * (dl * dl - phi * phi - v - ex) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU); };
  let A = a, B;
  if (dl * dl > phi * phi + v) B = Math.log(dl * dl - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0 && k < 50) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + (A - B) * fA / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiS = Math.sqrt(phi * phi + vol * vol);
  const phiN = 1 / Math.sqrt(1 / (phiS * phiS) + 1 / v);
  const muN = mu + phiN * phiN * g * (s - E);
  const before = Math.round(p.r);
  // Variation limitée à ±120 par résultat pour rester encourageant
  p.r = Math.max(100, Math.min(p.r + 120, Math.max(p.r - 120, SC * muN + 1500)));
  p.rd = Math.min(250, Math.max(45, SC * phiN));
  p.vol = Math.min(0.2, vol);
  p.n++;
  p.hist.push(Math.round(p.r)); if (p.hist.length > 60) p.hist.shift();
  return Math.round(p.r) - before;
}

// Sons : enregistrements de pièces (pychess, GPLv3) + résonance et jingles synthétisés.
let ctx = null, master = null;
const buffers = {};
let loading = null;
export const sound = { enabled: true };
const FILES = { m1: 'sounds/move_white.wav', m2: 'sounds/move_black.wav', c1: 'sounds/capture_white.wav', c2: 'sounds/capture_black.wav' };

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function load() {
  if (loading || !ac()) return;
  loading = Promise.all(Object.entries(FILES).map(([k, url]) =>
    fetch(url).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then(buf => { buffers[k] = buf; }).catch(() => {})));
}
export const unlockAudio = () => { if (sound.enabled) { ac(); load(); } };

function sample(k, delay = 0, gain = 1, rate = 1) {
  const c = ac(), b = buffers[k]; if (!c || !b) return false;
  const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = c.createGain(); g.gain.value = gain;
  s.connect(g).connect(master); s.start(c.currentTime + delay);
  return true;
}
// Résonance de la table / du plateau en bois (partiels amortis)
function body(delay = 0, gain = 0.35, base = 180) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  for (const [mul, g, d] of [[1, 1, .09], [2.3, .45, .05], [4.1, .2, .03]]) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(base * mul, t);
    o.frequency.exponentialRampToValueAtTime(base * mul * .8, t + d);
    const og = c.createGain(); og.gain.setValueAtTime(gain * g, t); og.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(og).connect(master); o.start(t); o.stop(t + d + .02);
  }
}
function knock(delay = 0, gain = 0.6) { // repli si les fichiers ne sont pas chargés
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, len = Math.floor(c.sampleRate * .04);
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const s = c.createBufferSource(); s.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.4;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(bp).connect(g).connect(master); s.start(t);
}
function tone(delay, freq, dur, gain = 0.1, type = 'sine') {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const move = (delay = 0) => { if (!sample(Math.random() < .5 ? 'm1' : 'm2', delay)) knock(delay); body(delay, .3); };

export function play(kind) {
  if (!sound.enabled) return;
  try {
    switch (kind) {
      case 'move': move(); break;
      case 'capture': if (!sample('c2', 0, 1.1)) knock(0, .9); body(0, .45, 140); break;
      case 'castle': move(); move(.11); break;
      case 'check': move(); tone(.03, 880, .16, .07, 'triangle'); tone(.1, 1175, .2, .06, 'triangle'); break;
      case 'start': tone(0, 523, .25); tone(.12, 784, .35); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(i * .1, f, .4, .09, 'triangle')); break;
      case 'end': tone(0, 784, .3); tone(.15, 659, .3); tone(.3, 523, .5); break;
      case 'lose': tone(0, 392, .3, .08); tone(.18, 330, .3, .08); tone(.36, 262, .55, .08); break;
      case 'success': tone(0, 784, .15, .08, 'triangle'); tone(.08, 1175, .3, .08, 'triangle'); break;
      case 'error': tone(0, 196, .22, .09, 'square'); tone(.12, 147, .3, .07, 'square'); break;
      case 'low': tone(0, 1000, .08, .05, 'square'); break;
      case 'notify': tone(0, 988, .15); tone(.1, 1319, .25); break;
    }
  } catch { /* audio indisponible */ }
}

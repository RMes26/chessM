// Sons synthétisés (Web Audio) : aucun fichier audio, aucune licence.
let ctx = null;
export const sound = { enabled: true };

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const unlockAudio = () => { if (sound.enabled) ac(); };

// "Toc" de pièce en bois : bruit filtré + petite impulsion grave
function knock(delay = 0, { freq = 1700, q = 1.3, dur = 0.05, gain = 0.6, thump = 160 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g).connect(c.destination); src.start(t);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(thump * 0.5, t + 0.08);
  const og = c.createGain(); og.gain.setValueAtTime(gain * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.1);
}

function tone(delay, freq, dur, gain = 0.12, type = 'sine') {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

export function play(kind) {
  if (!sound.enabled) return;
  try {
    switch (kind) {
      case 'move': knock(); break;
      case 'capture': knock(0, { freq: 1100, gain: 0.85, thump: 110, dur: 0.07 }); knock(0.035, { freq: 2300, gain: 0.3, dur: 0.04 }); break;
      case 'castle': knock(); knock(0.09, { gain: 0.45 }); break;
      case 'check': knock(); tone(0.02, 880, 0.18, 0.1, 'triangle'); tone(0.1, 1175, 0.22, 0.08, 'triangle'); break;
      case 'start': tone(0, 523, 0.25); tone(0.12, 784, 0.35); break;
      case 'end': tone(0, 784, 0.3); tone(0.15, 659, 0.3); tone(0.3, 523, 0.5); break;
      case 'low': tone(0, 1000, 0.08, 0.06, 'square'); break;
      case 'notify': tone(0, 988, 0.15); tone(0.1, 1319, 0.25); break;
    }
  } catch { /* audio indisponible */ }
}

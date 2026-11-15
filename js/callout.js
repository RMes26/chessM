// Annonces des coups évidents (échec, mat, en passant, roque, promotion, grosses prises) + voix du navigateur
export const callouts = { voice: true, visual: true };
let frVoice = null;
const hasTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
  frVoice = vs.find(v => /fr[-_]FR/i.test(v.lang) && /google|natural|online|neural|am[ée]lie|thomas|audrey|denise|henri/i.test(v.name))
    || vs.find(v => /fr[-_]FR/i.test(v.lang)) || vs[0] || null;
}
if (hasTTS) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

export function speak(text) {
  if (!callouts.voice || !hasTTS) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR'; if (frVoice) u.voice = frVoice;
    u.rate = 1.08; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* voix indisponible */ }
}

const PIECE = { q: 'dame', r: 'tour', b: 'fou', n: 'cavalier' };

// m : coup verbose chess.js déjà joué, chess : position après le coup
export function detect(m, chess) {
  if (chess.isCheckmate()) return { text: 'Échec et mat !', icon: '♚', say: 'Échec et mat !', big: true };
  const check = chess.inCheck();
  let e = null;
  if (m.promotion) e = { text: `Promotion en ${PIECE[m.promotion]} !`, icon: '♛', say: `Promotion en ${PIECE[m.promotion]}` };
  else if (m.captured === 'q') e = { text: 'Dame capturée !', icon: '♛', say: 'Dame capturée' };
  else if (m.flags.includes('e')) e = { text: 'En passant !', icon: '♟', say: 'En passant' };
  else if (m.captured === 'r') e = { text: 'Tour capturée !', icon: '♜', say: 'Tour capturée' };
  else if (m.flags.includes('k')) e = { text: 'Petit roque', icon: '♜', say: 'Petit roque' };
  else if (m.flags.includes('q')) e = { text: 'Grand roque', icon: '♜', say: 'Grand roque' };
  if (check) {
    if (e) { e.text += ' Échec !'; e.say += ', échec'; }
    else e = { text: 'Échec !', icon: '⚠', say: 'Échec' };
  }
  return e;
}

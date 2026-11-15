// Icônes vectorielles (sprite Lucide, licence ISC)
export const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="icons/sprite.svg#${name}"></use></svg>`;
export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const pieceImg = (t, color = 'w', cls = '') => `<i class="piece ${PIECE_NAMES[t]} ${color === 'w' ? 'white' : 'black'} ${cls}" aria-hidden="true"></i>`;

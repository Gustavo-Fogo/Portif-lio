// Transporte público: cores oficiais das linhas, tipos de etapa e cálculos dos trajetos

export const STEP_KINDS = [
  { id: 'walk', label: 'A pé', icon: '🚶' },
  { id: 'metro', label: 'Metrô', icon: '🚇' },
  { id: 'rer', label: 'RER (trem)', icon: '🚆' },
  { id: 'bus', label: 'Ônibus', icon: '🚌' },
  { id: 'tram', label: 'Tram (bonde)', icon: '🚊' },
  { id: 'train', label: 'Trem / Transilien', icon: '🚆' },
  { id: 'funicular', label: 'Funicular', icon: '🚡' },
  { id: 'uber', label: 'Táxi / Uber', icon: '🚕' },
  { id: 'plane', label: 'Avião', icon: '✈️' },
];
export const kindInfo = (id) => STEP_KINDS.find((k) => k.id === id) || STEP_KINDS[0];
export const isTransit = (kind) => ['metro', 'rer', 'bus', 'tram', 'train', 'funicular'].includes(kind);

// Cores oficiais (RATP / IDF Mobilités)
const METRO = {
  1: '#FFCD00', 2: '#003CA6', 3: '#837902', '3bis': '#6EC4E8', 4: '#CF009E', 5: '#FF7E2E', 6: '#6ECA97',
  7: '#FA9ABA', '7bis': '#6ECA97', 8: '#E19BDF', 9: '#B6BD00', 10: '#C9910D', 11: '#704B1C', 12: '#007852',
  13: '#6EC4E8', 14: '#62259D',
};
const RER = { A: '#E3051C', B: '#5291CE', C: '#FFCE00', D: '#00814F', E: '#C04191' };

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}

/** Cor e texto do selo da linha. */
export function lineStyle(kind, line) {
  const key = String(line || '').trim().replace(/^(M|RER|T)\s*/i, '').toUpperCase().replace('BIS', 'bis');
  let bg = '#5f6873';
  if (kind === 'metro' && METRO[key.toLowerCase()] ) bg = METRO[key.toLowerCase()];
  else if (kind === 'metro' && METRO[key]) bg = METRO[key];
  else if (kind === 'rer' && RER[key]) bg = RER[key];
  else if (kind === 'bus') bg = '#00A88F';
  else if (kind === 'tram') bg = '#0064B0';
  else if (kind === 'train') bg = '#7B6EAD';
  else if (kind === 'funicular') bg = '#8a5a44';
  return { background: bg, color: textOn(bg), label: key || '' };
}

export const stepMinutes = (s) => {
  const n = Number(String(s?.min ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Duração total do trajeto (minutos) a partir das etapas; 0 se não houver. */
export function routeMinutes(transfer) {
  return (transfer?.steps || []).reduce((s, x) => s + stepMinutes(x), 0);
}

export function fmtMinutes(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}

/** Horário sugerido de saída: chegada − duração (HH:MM). */
export function departureTime(arrival, minutes) {
  const m = String(arrival || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m || !minutes) return '';
  let t = Number(m[1]) * 60 + Number(m[2]) - Math.ceil(minutes / 5) * 5;
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function hasRoute(transfer) {
  return !!(transfer && ((transfer.steps && transfer.steps.length) || transfer.mode || transfer.line || transfer.duration || transfer.note));
}

export const newStep = (data = {}) => ({ kind: 'metro', line: '', from: '', to: '', direction: '', stops: '', min: '', note: '', ...data });

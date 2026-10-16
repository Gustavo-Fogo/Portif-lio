// Modelo de dados, constantes e fábricas
import { dateRange } from './format.js';

export const DATA_VERSION = 1;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const now = () => Date.now();

// Paleta categórica fixa (ordem fixa, cor segue a entidade).
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const OTHER_COLOR = '#8a8984';

export const DEFAULT_CATEGORIES = [
  { id: 'hospedagem', name: 'Hospedagem' },
  { id: 'transporte', name: 'Transporte' },
  { id: 'alimentacao', name: 'Alimentação' },
  { id: 'passeios', name: 'Passeios/Ingressos' },
  { id: 'compras', name: 'Compras' },
  { id: 'documentos', name: 'Documentos/Seguro' },
  { id: 'outros', name: 'Outros' },
].map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));

export const PAYMENT_METHODS = [
  { id: 'credito', label: 'Cartão de crédito', card: true },
  { id: 'debito', label: 'Cartão de débito', card: true },
  { id: 'global', label: 'Cartão/conta global (Wise, Nomad…)' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'outro', label: 'Outro' },
];
export const paymentLabel = (id) => PAYMENT_METHODS.find((p) => p.id === id)?.label || '—';
export const isCardPayment = (id) => !!PAYMENT_METHODS.find((p) => p.id === id)?.card;

// Valores especiais de "quem pagou"
export const PAYER_NONE = ''; // ainda não definido (gasto futuro)
export const PAYER_EACH = '__cada_um__'; // cada um pagou a própria parte (não gera dívida)

export const STATUS = {
  pago: 'Pago',
  a_pagar: 'A pagar',
  estimado: 'A gastar (estimado)',
};
export const STATUS_SHORT = { pago: 'Pago', a_pagar: 'A pagar', estimado: 'Estimado' };
export const MOMENTS = { antes: 'Antes da viagem', durante: 'Durante a viagem' };
export const TYPES = { fixo: 'Fixo', flexivel: 'Flexível' };

export const TRANSPORT_MODES = ['A pé', 'Metrô', 'RER', 'Trem', 'Ônibus', 'Tram', 'Táxi/Uber', 'Carro', 'Bicicleta', 'Barco', 'Avião', 'Outro'];
export const FIXED_TRANSPORT_TYPES = ['Voo', 'Trem', 'Ônibus', 'Transfer', 'Carro alugado', 'Passe de transporte', 'Outro'];
export const RISK_TYPES = ['Horário', 'Feriado', 'Transporte', 'Clima', 'Segurança', 'Saúde', 'Documentos', 'Dinheiro', 'Outro'];
export const RISK_LEVELS = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };

export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'Dólar americano (US$)' },
  { code: 'GBP', label: 'Libra (£)' },
  { code: 'CHF', label: 'Franco suíço' },
  { code: 'ARS', label: 'Peso argentino' },
  { code: 'CLP', label: 'Peso chileno' },
  { code: 'UYU', label: 'Peso uruguaio' },
  { code: 'JPY', label: 'Iene' },
  { code: 'CAD', label: 'Dólar canadense' },
  { code: 'BRL', label: 'Real (viagem nacional)' },
];

export const DEFAULT_CHECKLIST = [
  ['Documentos', 'Passaportes válidos (mín. 6 meses após a volta)'],
  ['Documentos', 'Seguro viagem contratado e apólice salva no celular'],
  ['Documentos', 'Cópias digitais dos documentos (nuvem/e-mail)'],
  ['Documentos', 'Verificar exigências de entrada do país (ex.: ETIAS na Europa)'],
  ['Reservas', 'Passagens aéreas emitidas e check-in online'],
  ['Reservas', 'Hospedagem confirmada (endereço e instruções de chegada)'],
  ['Reservas', 'Ingressos com horário marcado comprados'],
  ['Dinheiro', 'Avisar o banco / habilitar cartões para uso no exterior'],
  ['Dinheiro', 'Carregar cartão/conta global'],
  ['Dinheiro', 'Um pouco de dinheiro em espécie na moeda local'],
  ['Celular', 'Chip/eSIM internacional'],
  ['Celular', 'Mapas offline baixados e apps de transporte instalados'],
  ['Celular', 'Exportar backup deste app e importar nos outros celulares'],
  ['Bagagem', 'Adaptador de tomada'],
  ['Bagagem', 'Remédios de uso contínuo e receitas'],
  ['Bagagem', 'Roupas adequadas ao clima'],
];

export function makeChecklist(items = DEFAULT_CHECKLIST) {
  return items.map(([group, text]) => ({ id: uid(), group, text, done: false, updatedAt: now() }));
}

export function newTrip(data = {}) {
  const t = now();
  const participants = (data.participants?.length ? data.participants : ['Pessoa 1']).map((p) =>
    typeof p === 'string' ? { id: uid(), name: p, updatedAt: t } : { updatedAt: t, ...p }
  );
  const trip = {
    id: uid(),
    name: '',
    destination: '',
    country: '',
    startDate: '',
    endDate: '',
    currency: 'EUR',
    lodging: { name: '', address: '', lat: null, lng: null },
    participants,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, updatedAt: t })),
    exchange: { spreadPct: 4, iofPct: 3.5, manualRate: null },
    detax: { ratePct: 12, minAmount: 100.01 },
    expenses: [],
    days: [],
    activities: [],
    transports: [],
    checklist: makeChecklist(),
    risks: [],
    notes: '',
    deleted: {},
    createdAt: t,
    updatedAt: t,
    ...data,
  };
  trip.participants = participants;
  syncDays(trip);
  return trip;
}

/** Garante um bloco por dia da viagem (mantém temas existentes). */
export function syncDays(trip) {
  const dates = dateRange(trip.startDate, trip.endDate);
  const existing = new Map((trip.days || []).map((d) => [d.date, d]));
  const days = dates.map((date) => existing.get(date) || { id: date, date, theme: '', updatedAt: now() });
  // Dias fora do intervalo que ainda têm atividades são mantidos.
  for (const d of trip.days || []) {
    if (!dates.includes(d.date) && (trip.activities || []).some((a) => a.date === d.date)) days.push(d);
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  trip.days = days;
  return trip;
}

export function newExpense(trip, data = {}) {
  const everyone = trip.participants.map((p) => p.id);
  const first = trip.participants[0]?.id || '';
  return {
    id: uid(),
    description: '',
    vendor: '',
    categoryId: 'outros',
    qty: 1,
    unitPrice: 0,
    currency: trip.currency || 'EUR',
    moment: 'antes',
    day: '',
    type: 'fixo',
    status: 'estimado',
    dueDate: '',
    paymentMethod: 'credito',
    paidBy: PAYER_NONE,
    split: { mode: everyone.length > 1 ? 'igual' : 'individual', people: everyone.length > 1 ? everyone : [first] },
    detax: false,
    paidBRL: null,
    note: '',
    source: 'manual',
    activityId: null,
    createdAt: now(),
    updatedAt: now(),
    ...data,
  };
}

export function newActivity(data = {}) {
  return {
    id: uid(),
    date: '',
    order: 0,
    time: '',
    title: '',
    address: '',
    lat: null,
    lng: null,
    note: '',
    alert: '',
    cost: null,
    costCurrency: 'EUR',
    expenseId: null,
    transfer: { duration: '', mode: '', line: '', note: '' },
    updatedAt: now(),
    ...data,
  };
}

export function newTransport(data = {}) {
  return {
    id: uid(),
    type: 'Voo',
    description: '',
    from: '',
    to: '',
    date: '',
    time: '',
    arrival: '',
    code: '',
    note: '',
    updatedAt: now(),
    ...data,
  };
}

export function newRisk(data = {}) {
  return { id: uid(), text: '', type: 'Outro', level: 'medio', date: '', done: false, updatedAt: now(), ...data };
}

export const categoryOf = (trip, id) =>
  trip.categories.find((c) => c.id === id) || { id: 'outros', name: 'Outros', color: OTHER_COLOR };
export const personName = (trip, id) => trip.participants.find((p) => p.id === id)?.name || '—';
export const isPerson = (trip, id) => trip.participants.some((p) => p.id === id);
export function payerLabel(trip, id) {
  if (id === PAYER_EACH) return 'Cada um pagou a sua parte';
  if (!isPerson(trip, id)) return 'A definir';
  return personName(trip, id);
}

/** Cor estável por dia (ordem do dia na viagem). */
export function dayColor(trip, date) {
  const idx = trip.days.findIndex((d) => d.date === date);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

export function activitiesOfDay(trip, date) {
  return trip.activities
    .filter((a) => a.date === date)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.time).localeCompare(String(b.time)));
}

/** Viagem de Paris (primeira viagem cadastrada). */
export function parisSeed() {
  const trip = newTrip({
    name: 'Paris 2026',
    destination: 'Paris',
    country: 'França',
    startDate: '2026-11-10',
    endDate: '2026-11-14',
    currency: 'EUR',
    lodging: { name: 'Hospedagem em Le Blanc-Mesnil', address: 'Le Blanc-Mesnil, Seine-Saint-Denis, França', lat: 48.9386, lng: 2.4614 },
    participants: ['Pessoa 1', 'Pessoa 2', 'Pessoa 3', 'Pessoa 4'],
    seed: true,
  });
  trip.checklist.push(
    ...makeChecklist([
      ['Paris', 'Comprar passes de transporte (Navigo Easy/Découverte ou bilhetes no app)'],
      ['Paris', 'Reservar horário no Louvre / Torre Eiffel / museus'],
      ['Paris', 'Planejar trajeto CDG/Orly ↔ Le Blanc-Mesnil (RER B)'],
    ])
  );
  trip.risks = [
    newRisk({ type: 'Horário', level: 'alto', date: '2026-11-10', text: 'Terça (10/11): o Louvre fecha às terças. Programe outro museu (Orsay abre às terças).' }),
    newRisk({ type: 'Feriado', level: 'alto', date: '2026-11-11', text: 'Quarta (11/11): feriado nacional (Armistício). Cerimônia no Arco do Triunfo, bloqueios na Champs-Élysées pela manhã e parte do comércio fechado.' }),
    newRisk({ type: 'Transporte', level: 'alto', text: 'Último RER B para Le Blanc-Mesnil sai por volta da meia-noite. Metrô funciona até ~1h15 (sex/sáb até ~2h15). Confira no app RATP/IDF Mobilités.' }),
    newRisk({ type: 'Transporte', level: 'medio', text: 'Greves (grèves) podem afetar metrô/RER. Verifique na véspera.' }),
    newRisk({ type: 'Segurança', level: 'medio', text: 'Batedores de carteira no metrô, RER B e pontos turísticos. Celular e carteira na frente.' }),
    newRisk({ type: 'Clima', level: 'baixo', text: 'Novembro: frio (5–12 °C), chuva frequente e pôr do sol por volta de 17h10.' }),
    newRisk({ type: 'Dinheiro', level: 'medio', text: 'Detax: mínimo de €100,01 na mesma loja e no mesmo dia. Valide no quiosque PABLO no aeroporto antes do check-in.' }),
  ];
  return trip;
}

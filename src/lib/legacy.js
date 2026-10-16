// Conversão do formato antigo (viagens.html, localStorage "travelPlannerData_v1").
// O formato antigo não tinha esquema fixo documentado; a conversão reconhece os
// campos pelo nome (pt/en), da mesma forma que o mapeamento de planilhas.
import { norm, round2 } from './format.js';
import { newTrip, newExpense, newActivity, newTransport, newRisk, uid, now, syncDays } from './model.js';
import { FIELDS, suggestMapping, parseNumber, parseDate, mapStatus, mapMoment, mapType, mapPayment, mapCategory, mapPerson, mapSplit, detectCurrency } from './parse.js';

export const LEGACY_KEY = 'travelPlannerData_v1';

const pick = (obj, names) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = Object.keys(obj);
  for (const n of names) {
    const k = keys.find((k) => norm(k).replace(/ /g, '') === norm(n).replace(/ /g, ''));
    if (k !== undefined && obj[k] !== '' && obj[k] !== null && obj[k] !== undefined) return obj[k];
  }
  return undefined;
};

const findArray = (obj, re) => {
  if (!obj || typeof obj !== 'object') return [];
  for (const [k, v] of Object.entries(obj)) if (re.test(norm(k).replace(/ /g, '')) && Array.isArray(v)) return v;
  // Um nível abaixo (ex.: { financeiro: { gastos: [...] } })
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) if (re.test(norm(k2).replace(/ /g, '')) && Array.isArray(v2)) return v2;
    }
  }
  return [];
};

const str = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? '' : String(v).trim());
const IGNORED_KEYS = /numeropessoas|numpessoas|pessoas|travelers|people|mapa|map|claude|esquema/;

/** Aceita o JSON (objeto ou string, inclusive string com JSON dentro) e devolve viagens no formato novo. */
export function convertLegacy(input) {
  let data = input;
  for (let i = 0; i < 3 && typeof data === 'string'; i++) data = JSON.parse(data);
  if (!data || typeof data !== 'object') throw new Error('JSON vazio ou inválido.');

  let tripsRaw = Array.isArray(data) ? data : findArray(data, /^(trips|viagens|travels|viagem)$/);
  if (!tripsRaw.length) tripsRaw = [data];
  const report = [];
  const trips = tripsRaw.map((raw, i) => convertTrip(raw, data, i, report));
  return { trips, report };
}

function convertTrip(raw, root, index, report) {
  const name = str(pick(raw, ['nome', 'name', 'titulo', 'title', 'viagem', 'tripName'])) || `Viagem importada ${index + 1}`;
  const dest = str(pick(raw, ['destino', 'destination', 'cidade', 'city', 'local']));
  const startDate = parseDate(pick(raw, ['dataInicio', 'inicio', 'startDate', 'start', 'dataIda', 'ida', 'dataInicial', 'de'])) || '';
  const endDate = parseDate(pick(raw, ['dataFim', 'fim', 'endDate', 'end', 'dataVolta', 'volta', 'dataFinal', 'ate'])) || startDate;
  const currency = (str(pick(raw, ['moeda', 'currency', 'moedaLocal'])) || 'EUR').toUpperCase().slice(0, 3);

  const lodgingRaw = pick(raw, ['hospedagem', 'hotel', 'lodging', 'accommodation', 'acomodacao']);
  const lodging =
    typeof lodgingRaw === 'object'
      ? { name: str(pick(lodgingRaw, ['nome', 'name'])), address: str(pick(lodgingRaw, ['endereco', 'address', 'local'])), lat: num(pick(lodgingRaw, ['lat', 'latitude'])), lng: num(pick(lodgingRaw, ['lng', 'lon', 'longitude'])) }
      : { name: str(lodgingRaw), address: str(lodgingRaw), lat: null, lng: null };

  // Participantes: só se houver lista de nomes (o antigo "número de pessoas" é descartado).
  let participants = findArray(raw, /^(participantes|participants|viajantes|travelers|pessoaslista|membros)$/)
    .map((p) => (typeof p === 'string' ? p : str(pick(p, ['nome', 'name']))))
    .filter(Boolean);
  if (!participants.length) participants = ['Pessoa 1'];

  const trip = newTrip({ name, destination: dest, startDate, endDate, currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR', lodging, participants });
  trip.checklist = [];

  // Câmbio
  const ex = pick(raw, ['cambio', 'exchange', 'cotacao', 'câmbio']) ?? pick(root, ['cambio', 'exchange', 'cotacao']);
  if (ex && typeof ex === 'object') {
    const rate = num(pick(ex, ['oficial', 'cotacao', 'rate', 'taxa', 'euro', 'valor', 'cambioOficial']));
    const spread = num(pick(ex, ['spread']));
    const iof = num(pick(ex, ['iof']));
    const cartao = num(pick(ex, ['cartao', 'cambioCartao', 'card', 'cardRate']));
    if (rate > 0) trip.exchange.manualRate = rate;
    if (spread !== null) trip.exchange.spreadPct = spread;
    if (iof !== null) trip.exchange.iofPct = iof;
    if (spread === null && iof === null && cartao > 0 && rate > 0) {
      trip.exchange.spreadPct = round2(((cartao / rate - 1) * 100));
      trip.exchange.iofPct = 0;
    }
  } else if (typeof ex === 'number') trip.exchange.manualRate = ex;

  // Gastos e compras
  const expensesRaw = findArray(raw, /(gasto|despesa|expense|custo|cost|orcamento|budget)/);
  const purchasesRaw = findArray(raw, /(compra|purchase|shopping)/);
  const fixedRaw = findArray(raw, /(transportefixo|fixedtransport|transporte|transport|voos|flights)/);
  trip.expenses = [
    ...expensesRaw.map((e) => objToExpense(e, trip, 'gastos')),
    ...purchasesRaw.map((e) => objToExpense(e, trip, 'compras')),
  ].filter(Boolean);

  // Transporte fixo
  trip.transports = fixedRaw
    .filter((t) => t && typeof t === 'object')
    .map((t) =>
      newTransport({
        type: str(pick(t, ['tipo', 'type', 'meio'])) || 'Outro',
        description: str(pick(t, ['descricao', 'description', 'nome', 'name', 'titulo'])),
        from: str(pick(t, ['de', 'origem', 'from', 'saida'])),
        to: str(pick(t, ['para', 'destino', 'to', 'chegada'])),
        date: parseDate(pick(t, ['data', 'date', 'dia'])),
        time: str(pick(t, ['hora', 'horario', 'time', 'partida'])),
        arrival: str(pick(t, ['horaChegada', 'chegadaHora', 'arrival'])),
        code: str(pick(t, ['codigo', 'code', 'voo', 'numero', 'localizador', 'reserva'])),
        note: str(pick(t, ['obs', 'observacao', 'notas', 'note', 'notes'])),
      })
    );
  // Transporte fixo com valor também vira gasto.
  for (const t of fixedRaw) {
    const v = num(pick(t, ['valor', 'custo', 'preco', 'price', 'cost', 'total']));
    if (v > 0) trip.expenses.push(objToExpense({ ...t, categoria: 'Transporte' }, trip, 'transporte'));
  }

  // Roteiro
  const daysRaw = findArray(raw, /^(roteiro|itinerario|itinerary|dias|days|schedule|agenda|programacao)$/);
  const flatActs = [];
  for (const [di, d] of daysRaw.entries()) {
    if (!d || typeof d !== 'object') continue;
    const acts = findArray(d, /(atividade|activit|eventos?|items?|programa|paradas|stops)/);
    if (acts.length) {
      const date = parseDate(pick(d, ['data', 'date', 'dia'])) || (startDate ? addDays(startDate, di) : '');
      const theme = str(pick(d, ['tema', 'theme', 'titulo', 'title', 'nome']));
      flatActs.push(...acts.map((a) => ({ a, date })));
      if (date) trip.days.push({ id: date, date, theme, updatedAt: now() });
    } else {
      flatActs.push({ a: d, date: parseDate(pick(d, ['data', 'date', 'dia'])) });
    }
  }
  const order = {};
  trip.activities = flatActs
    .filter(({ a }) => a && typeof a === 'object')
    .map(({ a, date }) => {
      const dt = date || parseDate(pick(a, ['data', 'date', 'dia'])) || startDate;
      order[dt] = (order[dt] || 0) + 1;
      const desl = pick(a, ['deslocamento', 'transfer', 'trajeto', 'transporte', 'comoChegar']);
      const transfer =
        desl && typeof desl === 'object'
          ? { duration: str(pick(desl, ['tempo', 'duracao', 'duration', 'time'])), mode: str(pick(desl, ['meio', 'modo', 'mode', 'transporte', 'tipo'])), line: str(pick(desl, ['linha', 'line'])), note: str(pick(desl, ['obs', 'note'])) }
          : {
              duration: str(pick(a, ['tempoDeslocamento', 'tempo', 'duracaoDeslocamento'])),
              mode: str(pick(a, ['meioTransporte', 'meio', 'modo'])) || str(desl),
              line: str(pick(a, ['linha', 'line'])),
              note: '',
            };
      const cost = num(pick(a, ['custo', 'valor', 'preco', 'cost', 'price']));
      return newActivity({
        date: dt,
        order: order[dt],
        time: str(pick(a, ['horario', 'hora', 'time', 'inicio'])),
        title: str(pick(a, ['local', 'nome', 'titulo', 'title', 'name', 'atividade', 'descricao'])),
        address: str(pick(a, ['endereco', 'address'])),
        lat: num(pick(a, ['lat', 'latitude'])),
        lng: num(pick(a, ['lng', 'lon', 'longitude'])),
        note: str(pick(a, ['obs', 'observacao', 'nota', 'notas', 'note', 'notes', 'descricao'])),
        alert: str(pick(a, ['alerta', 'alert', 'aviso', 'atencao', 'warning'])),
        cost: cost > 0 ? cost : null,
        costCurrency: trip.currency,
        transfer,
      });
    });

  // Checklist
  const check = findArray(raw, /^(checklist|tarefas|todo|todos|preparacao|lista)$/);
  trip.checklist = check
    .map((c) => (typeof c === 'string' ? { text: c, done: false } : { text: str(pick(c, ['texto', 'text', 'item', 'nome', 'titulo', 'descricao'])), done: !!pick(c, ['feito', 'done', 'checked', 'ok', 'concluido']), group: str(pick(c, ['grupo', 'categoria', 'group'])) }))
    .filter((c) => c.text)
    .map((c) => ({ id: uid(), group: c.group || 'Geral', text: c.text, done: c.done, updatedAt: now() }));

  // Riscos / alertas
  const risks = findArray(raw, /^(riscos|risks|alertas|alerts|avisos|warnings)$/);
  trip.risks = risks
    .map((r) =>
      typeof r === 'string'
        ? newRisk({ text: r })
        : newRisk({
            text: str(pick(r, ['texto', 'text', 'descricao', 'risco', 'alerta', 'titulo'])),
            type: str(pick(r, ['tipo', 'type', 'categoria'])) || 'Outro',
            level: /alt|high/i.test(str(pick(r, ['nivel', 'level', 'gravidade', 'prioridade']))) ? 'alto' : /baix|low/i.test(str(pick(r, ['nivel', 'level', 'gravidade', 'prioridade']))) ? 'baixo' : 'medio',
            date: parseDate(pick(r, ['data', 'date', 'dia'])),
          })
    )
    .filter((r) => r.text);

  syncDays(trip);
  const ignored = Object.keys(raw).filter((k) => IGNORED_KEYS.test(norm(k).replace(/ /g, '')));
  report.push({
    trip: trip.name,
    expenses: trip.expenses.length,
    activities: trip.activities.length,
    transports: trip.transports.length,
    checklist: trip.checklist.length,
    risks: trip.risks.length,
    ignored,
  });
  return trip;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseNumber(v);
  return isNaN(n) ? null : n;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Converte um objeto de gasto (chaves livres) usando o mesmo mapeamento das planilhas. */
function objToExpense(obj, trip, role) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = Object.keys(obj).filter((k) => typeof obj[k] !== 'object' || obj[k] === null);
  const mapping = suggestMapping(keys);
  const get = (field) => (mapping[field] >= 0 ? obj[keys[mapping[field]]] : undefined);
  const year = trip.startDate ? Number(trip.startDate.slice(0, 4)) : undefined;

  const total = num(get('total'));
  let qty = num(get('qty'));
  let unit = num(get('unitPrice'));
  if (!(qty > 0)) qty = 1;
  if (unit === null && total !== null) unit = total / qty;
  const currencyField = get('currency');
  const currency = detectCurrency(currencyField, null) || (/brl|real/i.test(String(currencyField)) ? 'BRL' : null) || detectCurrency(get('total'), null) || trip.currency;
  const status = mapStatus(get('status')) || (obj.pago === true ? 'pago' : obj.pago === false ? 'a_pagar' : 'estimado');
  const day = parseDate(get('day'), year);
  const paidBy = mapPerson(get('paidBy'), trip.participants) || '';
  const detaxRaw = get('detax');
  return newExpense(trip, {
    description: str(get('description')) || '(sem descrição)',
    vendor: str(get('vendor')),
    categoryId: mapCategory(get('category'), trip.categories) || (role === 'compras' ? 'compras' : role === 'transporte' ? 'transporte' : 'outros'),
    qty: round2(qty),
    unitPrice: unit ?? 0,
    currency,
    moment: mapMoment(get('moment')) || (role === 'compras' || (day && day >= trip.startDate) ? 'durante' : 'antes'),
    day,
    type: mapType(get('type')) || (status === 'estimado' ? 'flexivel' : 'fixo'),
    status,
    dueDate: parseDate(get('dueDate'), year),
    paymentMethod: mapPayment(get('paymentMethod')) || 'credito',
    paidBy,
    split: mapSplit(get('split'), trip.participants, paidBy) || { mode: trip.participants.length > 1 ? 'igual' : 'individual', people: trip.participants.map((p) => p.id) },
    detax: detaxRaw === true || /^(sim|s|x|true|1|yes)$/i.test(String(detaxRaw ?? '').trim()),
    paidBRL: num(get('paidBRL')),
    note: str(get('note')),
    source: 'legado',
  });
}

/** Tenta ler o formato antigo direto do localStorage deste navegador (mesmo endereço). */
export function readLegacyFromLocalStorage() {
  try {
    return localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

export { FIELDS };

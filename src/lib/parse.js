// Importação de planilhas – mapeamento e normalização (sem dependência do SheetJS)
import { norm, round2, toISODate, parseISODate } from './format.js';
import { newExpense, uid, PALETTE, now } from './model.js';
import { expenseTotal, toBRL } from './money.js';

// ---------- Campos e sinônimos ----------
export const FIELDS = [
  { key: 'description', label: 'Descrição', syn: ['descricao', 'descrição', 'item', 'gasto', 'despesa', 'produto', 'nome', 'o que', 'atividade', 'compra'] },
  { key: 'vendor', label: 'Local / fornecedor', syn: ['local', 'fornecedor', 'loja', 'estabelecimento', 'onde', 'empresa', 'site', 'vendor'] },
  { key: 'category', label: 'Categoria', syn: ['categoria', 'tipo de gasto', 'grupo', 'classificacao', 'category'] },
  { key: 'qty', label: 'Quantidade', syn: ['quantidade', 'qtd', 'qtde', 'quant', 'qty', 'unidades', 'pessoas'] },
  { key: 'unitPrice', label: 'Valor unitário', syn: ['valor unitario', 'unitario', 'preco unitario', 'vl unit', 'preco', 'valor un', 'unit'] },
  { key: 'total', label: 'Valor total', syn: ['total', 'valor total', 'valor', 'custo', 'montante', 'preco total', 'subtotal', 'amount'] },
  { key: 'currency', label: 'Moeda', syn: ['moeda', 'currency', 'divisa'] },
  { key: 'moment', label: 'Momento (antes/durante)', syn: ['momento', 'quando', 'fase', 'periodo', 'antes durante'] },
  { key: 'day', label: 'Dia (durante a viagem)', syn: ['dia', 'data', 'data do gasto', 'date', 'dia da viagem'] },
  { key: 'type', label: 'Tipo (fixo/flexível)', syn: ['tipo', 'fixo flexivel', 'natureza'] },
  { key: 'status', label: 'Status', syn: ['status', 'situacao', 'pago', 'estado', 'pagamento status'] },
  { key: 'dueDate', label: 'Vencimento', syn: ['vencimento', 'data vencimento', 'vence', 'prazo', 'data de pagamento'] },
  { key: 'paymentMethod', label: 'Forma de pagamento', syn: ['forma de pagamento', 'pagamento', 'forma', 'meio de pagamento', 'cartao', 'metodo'] },
  { key: 'paidBy', label: 'Quem pagou', syn: ['quem pagou', 'pagador', 'pago por', 'responsavel', 'pessoa', 'quem'] },
  { key: 'split', label: 'Divisão', syn: ['divisao', 'dividido', 'dividir', 'rateio', 'para quem', 'de quem', 'split'] },
  { key: 'detax', label: 'Detax', syn: ['detax', 'tax free', 'taxfree', 'restituicao', 'reembolso imposto', 'tax refund', 'vat'] },
  { key: 'paidBRL', label: 'Valor pago em R$', syn: ['valor em reais', 'valor pago r', 'pago em reais', 'total r', 'valor brl', 'em reais', 'reais', 'r$', 'brl'] },
  { key: 'note', label: 'Observação', syn: ['observacao', 'obs', 'nota', 'notas', 'comentario', 'detalhes', 'note'] },
];
export const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

export function classifySheets(sheetNames) {
  return sheetNames.map((name) => {
    const n = norm(name);
    let role = 'ignorar';
    if (/resumo|summary|totais/.test(n)) role = 'resumo';
    else if (/compra|shopping/.test(n)) role = 'compras';
    else if (/gasto|despesa|custo|expense|orcamento/.test(n)) role = 'gastos';
    return { name, role };
  }).map((s, _, all) => {
    // Planilha com uma única aba (CSV): trata como gastos.
    if (all.length === 1 && s.role === 'ignorar') return { ...s, role: 'gastos' };
    return s;
  });
}

/** Linha de cabeçalho: a que mais casa com os sinônimos, nas 15 primeiras. */
export function detectHeaderRow(rows) {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => norm(c)).filter(Boolean);
    const textCells = rows[i].filter((c) => typeof c === 'string' && c.trim() && isNaN(parseNumber(c))).length;
    let score = textCells * 0.2;
    for (const c of cells) if (FIELDS.some((f) => f.syn.some((s) => norm(s) === c))) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Sugere o mapeamento campo -> índice da coluna (ou -1). */
export function suggestMapping(headers) {
  const H = headers.map((h) => norm(h));
  const used = new Set();
  const mapping = {};
  // 1ª passada: igualdade exata; 2ª: contém.
  for (const pass of ['exact', 'contains']) {
    for (const f of FIELDS) {
      if (mapping[f.key] !== undefined && mapping[f.key] >= 0) continue;
      let found = -1;
      for (const s of [norm(f.label), ...f.syn.map(norm)]) {
        found = H.findIndex((h, i) => !used.has(i) && h && (pass === 'exact' ? h === s : (h.includes(s) && s.length >= 3) || (s.includes(h) && h.length >= 4)));
        if (found >= 0) break;
      }
      mapping[f.key] = found;
      if (found >= 0) used.add(found);
    }
  }
  return mapping;
}

// ---------- Conversões de valores ----------
export function parseNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|€|US\$|\$|£|EUR|BRL|USD|reais|euros?/gi, '').replace(/\s| /g, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isNaN(n) ? NaN : neg ? -n : n;
}

export function detectCurrency(text, fallback) {
  const s = String(text ?? '');
  if (/R\$|\bBRL\b|\breais?\b/i.test(s)) return 'BRL';
  if (/€|\bEUR\b|\beuros?\b/i.test(s)) return 'EUR';
  if (/US\$|\bUSD\b|d[oó]lar/i.test(s)) return 'USD';
  if (/£|\bGBP\b|libra/i.test(s)) return 'GBP';
  return fallback;
}

export function parseDate(v, yearHint) {
  if (v instanceof Date && !isNaN(v)) return toISODate(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de série de data do Excel (dias desde 30/12/1899).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return toISODate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISODate(new Date(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m) {
    let y = m[3] ? +m[3] : yearHint || new Date().getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!isNaN(d) && d.getDate() === +m[1]) return toISODate(d);
  }
  return '';
}

const truthy = (v) => /^(sim|s|x|yes|y|true|verdadeiro|1|ok|✓|✔|☑)$/i.test(String(v ?? '').trim());

export function mapStatus(v) {
  const s = norm(v);
  if (!s) return null;
  if (/estim|previs|a gastar|planej|orcad|flex/.test(s)) return 'estimado';
  if (/a pagar|pendente|vencer|falta|nao pago|aberto|parcel/.test(s)) return 'a_pagar';
  if (/pago|paga|quitad|ok|feito|sim|comprad|reservad|confirmad/.test(s) || truthy(v)) return 'pago';
  return null;
}
export function mapMoment(v) {
  const s = norm(v);
  if (!s) return null;
  if (/antes|pre|previo|antecip/.test(s)) return 'antes';
  if (/durante|na viagem|local|destino|la/.test(s)) return 'durante';
  return null;
}
export function mapType(v) {
  const s = norm(v);
  if (/flex|variavel|estimad/.test(s)) return 'flexivel';
  if (/fix/.test(s)) return 'fixo';
  return null;
}
export function mapPayment(v) {
  const s = norm(v);
  if (!s) return null;
  if (/debito/.test(s)) return 'debito';
  if (/wise|nomad|global|inter global|c6 global|avenue|travel card|pre pago/.test(s)) return 'global';
  if (/credito|cartao|card|visa|master|amex|elo/.test(s)) return 'credito';
  if (/pix/.test(s)) return 'pix';
  if (/dinheiro|especie|cash|nota/.test(s)) return 'dinheiro';
  if (/boleto/.test(s)) return 'boleto';
  if (/transf|ted|doc/.test(s)) return 'transferencia';
  return 'outro';
}

const CATEGORY_HINTS = {
  hospedagem: /hosped|hotel|airbnb|booking|apart|hostel|pousada/,
  transporte: /transp|voo|aere|passag|trem|metro|rer|uber|taxi|onibus|navigo|carro|transfer|combust|estacion/,
  alimentacao: /aliment|comida|restaur|refei|jantar|almoc|cafe|lanche|mercado|bebida/,
  passeios: /passeio|ingress|museu|tour|atra|show|excurs|entrada|ticket/,
  compras: /compra|loja|roupa|presente|souvenir|perfum|shopping/,
  documentos: /document|seguro|passaport|visto|etias|taxa|vacina/,
};

export function mapCategory(v, categories) {
  const s = norm(v);
  if (!s) return null;
  const exact = categories.find((c) => norm(c.name) === s || c.id === s);
  if (exact) return exact.id;
  const partial = categories.find((c) => norm(c.name).includes(s) || s.includes(norm(c.name)));
  if (partial) return partial.id;
  for (const [id, re] of Object.entries(CATEGORY_HINTS)) if (re.test(s) && categories.some((c) => c.id === id)) return id;
  return null;
}

export function mapPerson(v, participants) {
  const s = norm(v);
  if (!s) return null;
  const p = participants.find((x) => norm(x.name) === s) || participants.find((x) => s.includes(norm(x.name)) || norm(x.name).includes(s));
  return p?.id || null;
}

/** Divisão: "todos", "individual", "Ana, Bia", "Ana e Bia", "dividido por 2". */
export function mapSplit(v, participants, payerId) {
  const s = norm(v);
  if (!s) return null;
  if (/^(todos|geral|grupo|all|igual|dividido|compartilhado)$/.test(s) || /todos|everyone/.test(s)) {
    return { mode: 'igual', people: participants.map((p) => p.id) };
  }
  if (/individual|so eu|proprio|pessoal|sozinho/.test(s)) return { mode: 'individual', people: payerId ? [payerId] : [] };
  const ids = participants.filter((p) => new RegExp(`(^|\\s)${norm(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(s)).map((p) => p.id);
  if (ids.length === 1) return { mode: 'individual', people: ids };
  if (ids.length > 1) return { mode: 'igual', people: ids };
  const n = s.match(/(\d+)/);
  if (n && +n[1] >= 2) return { mode: 'igual', people: participants.slice(0, +n[1]).map((p) => p.id), approx: true };
  return null;
}

// ---------- Conversão das linhas em gastos ----------
export function defaultImportDefaults(trip, role = 'gastos') {
  return {
    currency: trip.currency || 'EUR',
    status: 'pago',
    moment: role === 'compras' ? 'durante' : 'antes',
    type: role === 'compras' ? 'flexivel' : 'fixo',
    categoryId: role === 'compras' ? 'compras' : 'outros',
    paymentMethod: 'credito',
    paidBy: trip.participants[0]?.id || '',
    splitMode: trip.participants.length > 1 ? 'igual' : 'individual',
    splitPeople: trip.participants.map((p) => p.id),
    detax: false,
    createCategories: true,
  };
}

/**
 * Converte as linhas de uma aba em gastos.
 * Retorna [{ rowNumber, expense, problems: [{level:'erro'|'aviso', msg}], include }]
 */
export function rowsToExpenses({ raw, text }, headerRow, mapping, defaults, trip, role = 'gastos') {
  const year = parseISODate(trip.startDate)?.getFullYear();
  const newCategories = [];
  const categories = [...trip.categories];
  const out = [];
  const col = (row, key) => (mapping[key] >= 0 ? row[mapping[key]] : '');

  for (let r = headerRow + 1; r < raw.length; r++) {
    const row = raw[r];
    const trow = text[r] || [];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;
    const problems = [];
    const description = String(col(row, 'description') ?? '').trim();
    const qtyRaw = col(row, 'qty');
    const unitRaw = col(row, 'unitPrice');
    const totalRaw = col(row, 'total');
    let qty = qtyRaw === '' ? NaN : parseNumber(qtyRaw);
    let unit = unitRaw === '' ? NaN : parseNumber(unitRaw);
    const total = totalRaw === '' ? NaN : parseNumber(totalRaw);

    if (!(qty > 0)) qty = NaN;
    if (isNaN(unit) && !isNaN(total)) {
      unit = isNaN(qty) ? total : total / qty;
    }
    if (isNaN(qty)) qty = 1;
    if (!isNaN(unit) && !isNaN(total) && Math.abs(round2(qty * unit) - total) > 0.05) {
      problems.push({ level: 'aviso', msg: `Quantidade × unitário (${round2(qty * unit)}) difere do total (${total}). Usado quantidade × unitário.` });
    }

    // Moeda: coluna de moeda > símbolo na célula de valor > padrão.
    const curText = mapping.currency >= 0 ? `${row[mapping.currency]} ${trow[mapping.currency] ?? ''}` : '';
    const valText = [mapping.total, mapping.unitPrice].filter((i) => i >= 0).map((i) => `${row[i]} ${trow[i] ?? ''}`).join(' ');
    const currency = detectCurrency(curText, null) || detectCurrency(valText, null) || defaults.currency;

    const isTotalRow = /^(total|subtotal|soma|totais)\b/.test(norm(description)) || (!description && !isNaN(total) && row.filter((c) => String(c).trim()).length <= 2);
    if (!description && isNaN(unit)) continue;
    if (!description) problems.push({ level: 'aviso', msg: 'Sem descrição.' });
    if (isNaN(unit)) problems.push({ level: 'erro', msg: 'Valor ausente ou inválido.' });
    if (isTotalRow) problems.push({ level: 'erro', msg: 'Parece uma linha de total/subtotal (não é um gasto).' });

    // Categoria
    let categoryId = defaults.categoryId;
    const catText = String(col(row, 'category') ?? '').trim();
    if (catText) {
      const found = mapCategory(catText, categories);
      if (found) categoryId = found;
      else if (defaults.createCategories) {
        const c = { id: 'cat-' + uid().slice(0, 8), name: catText, color: PALETTE[categories.length % PALETTE.length], updatedAt: now() };
        categories.push(c);
        newCategories.push(c);
        categoryId = c.id;
      } else problems.push({ level: 'aviso', msg: `Categoria "${catText}" não reconhecida; usado o padrão.` });
    }

    const status = mapStatus(col(row, 'status')) || defaults.status;
    const dueDate = parseDate(col(row, 'dueDate'), year);
    const day = parseDate(col(row, 'day'), year);
    let moment = mapMoment(col(row, 'moment'));
    if (!moment) moment = day && trip.startDate && day >= trip.startDate && day <= (trip.endDate || day) ? 'durante' : defaults.moment;
    const type = mapType(col(row, 'type')) || (status === 'estimado' ? 'flexivel' : defaults.type);
    const paymentMethod = mapPayment(col(row, 'paymentMethod')) || defaults.paymentMethod;
    const payerText = String(col(row, 'paidBy') ?? '').trim();
    let paidBy = mapPerson(payerText, trip.participants);
    if (payerText && !paidBy) problems.push({ level: 'aviso', msg: `Pessoa "${payerText}" não encontrada; usado o padrão.` });
    paidBy ||= defaults.paidBy;
    const splitText = String(col(row, 'split') ?? '').trim();
    let split = mapSplit(splitText, trip.participants, paidBy);
    if (splitText && !split) problems.push({ level: 'aviso', msg: `Divisão "${splitText}" não reconhecida; usado o padrão.` });
    if (split?.approx) problems.push({ level: 'aviso', msg: `Divisão "${splitText}": confira as pessoas selecionadas.` });
    if (!split) split = defaults.splitMode === 'individual' ? { mode: 'individual', people: [paidBy] } : { mode: 'igual', people: [...defaults.splitPeople] };
    else split = { mode: split.mode, people: split.people.length ? split.people : [paidBy] };

    const detaxText = col(row, 'detax');
    const detax = mapping.detax >= 0 && String(detaxText).trim() !== '' ? truthy(detaxText) || /detax|tax ?free/i.test(String(detaxText)) : defaults.detax;
    const paidBRLRaw = col(row, 'paidBRL');
    const paidBRL = currency !== 'BRL' && paidBRLRaw !== '' && !isNaN(parseNumber(paidBRLRaw)) ? round2(parseNumber(paidBRLRaw)) : null;

    if (status === 'a_pagar' && !dueDate) problems.push({ level: 'aviso', msg: 'A pagar sem data de vencimento.' });

    const expense = newExpense(trip, {
      description: description || '(sem descrição)',
      vendor: String(col(row, 'vendor') ?? '').trim(),
      categoryId,
      qty: round2(qty),
      unitPrice: isNaN(unit) ? 0 : Math.round(unit * 10000) / 10000,
      currency,
      moment,
      day: moment === 'durante' ? day : '',
      type,
      status,
      dueDate: status === 'a_pagar' ? dueDate : '',
      paymentMethod,
      paidBy,
      split,
      detax,
      paidBRL,
      note: String(col(row, 'note') ?? '').trim(),
      source: 'planilha:' + role,
    });
    out.push({ rowNumber: r + 1, expense, problems, include: !problems.some((p) => p.level === 'erro') });
  }
  return { rows: out, newCategories };
}

// ---------- Aba Resumo ----------
/** Encontra rótulos com "total" e o primeiro número à direita (ou abaixo). */
export function extractResumoTotals({ raw, text }) {
  const found = [];
  for (let r = 0; r < raw.length; r++) {
    for (let c = 0; c < raw[r].length; c++) {
      const label = raw[r][c];
      if (typeof label !== 'string' || !/total|soma|gasto geral|custo geral/i.test(label)) continue;
      let value = NaN;
      let vtext = '';
      for (let k = c + 1; k < raw[r].length; k++) {
        const n = parseNumber(raw[r][k]);
        if (!isNaN(n) && String(raw[r][k]).trim() !== '') {
          value = n;
          vtext = String(text[r]?.[k] ?? raw[r][k]);
          break;
        }
      }
      if (isNaN(value) && raw[r + 1]) {
        const n = parseNumber(raw[r + 1][c]);
        if (!isNaN(n) && String(raw[r + 1][c]).trim() !== '') {
          value = n;
          vtext = String(text[r + 1]?.[c] ?? raw[r + 1][c]);
        }
      }
      if (!isNaN(value)) found.push({ label: label.trim(), value: round2(value), currency: detectCurrency(`${label} ${vtext}`, null) });
    }
  }
  return found;
}

/** Totais do que foi importado, para comparar com a aba Resumo. */
export function importedTotals(expenses, trip, rate) {
  const t = { BRL: 0, EUR: 0, brlConverted: 0, byCurrency: {}, byStatusBRL: { pago: 0, a_pagar: 0, estimado: 0 } };
  for (const e of expenses) {
    const v = expenseTotal(e);
    t.byCurrency[e.currency] = round2((t.byCurrency[e.currency] || 0) + v);
    const brl = toBRL(e, trip, rate);
    t.brlConverted = round2(t.brlConverted + brl);
    t.byStatusBRL[e.status] = round2((t.byStatusBRL[e.status] || 0) + brl);
  }
  return t;
}

/** Para cada total do Resumo, procura o total importado mais próximo e calcula a diferença. */
export function compareWithResumo(resumoTotals, expenses, trip, rate, byRole = {}) {
  const all = importedTotals(expenses, trip, rate);
  const candidates = [];
  const addCands = (label, t) => {
    for (const [cur, v] of Object.entries(t.byCurrency)) candidates.push({ label: `${label} em ${cur} (valor original)`, currency: cur, value: v });
    candidates.push({ label: `${label} convertido para R$`, currency: 'BRL', value: t.brlConverted });
  };
  addCands('Total importado', all);
  for (const [role, list] of Object.entries(byRole)) if (list.length) addCands(`Aba ${role}`, importedTotals(list, trip, rate));
  for (const [st, v] of Object.entries(all.byStatusBRL)) if (v) candidates.push({ label: `Status "${st}" em R$`, currency: 'BRL', value: v });

  return resumoTotals.map((rt) => {
    const pool = candidates.filter((c) => !rt.currency || c.currency === rt.currency);
    const best = (pool.length ? pool : candidates).reduce((a, b) => (Math.abs(b.value - rt.value) < Math.abs(a.value - rt.value) ? b : a), (pool.length ? pool : candidates)[0]);
    const diff = best ? round2(best.value - rt.value) : NaN;
    return { ...rt, match: best, diff, ok: Math.abs(diff) <= Math.max(1, Math.abs(rt.value) * 0.005) };
  });
}

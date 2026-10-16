// Cálculos financeiros: conversão, totais, divisão e acerto de contas
import { round2 } from './format.js';
import { isCardPayment, categoryOf, PALETTE, PAYER_EACH } from './model.js';

export const expenseTotal = (e) => round2((Number(e.qty) || 0) * (Number(e.unitPrice) || 0));

export function cardMarkupPct(trip) {
  const ex = trip.exchange || {};
  return (Number(ex.spreadPct) || 0) + (Number(ex.iofPct) || 0);
}

/** Cotação efetiva da viagem: manual (se definida) ou a última buscada. */
export function effectiveRate(trip, rates) {
  if (trip.currency === 'BRL') return 1;
  const manual = Number(trip.exchange?.manualRate);
  if (manual > 0) return manual;
  return Number(rates?.[trip.currency]?.value) || 0;
}

export function hasPaidBRL(e) {
  return e.paidBRL !== null && e.paidBRL !== undefined && e.paidBRL !== '' && !isNaN(Number(e.paidBRL));
}

/**
 * Valor em reais de um gasto.
 * - BRL: o próprio total.
 * - Moeda estrangeira paga com valor em reais registrado: esse valor.
 * - Demais: total × cotação do dia (+ spread/IOF quando pago no cartão).
 */
export function toBRL(e, trip, rate) {
  const total = expenseTotal(e);
  if (e.currency === 'BRL') return total;
  if (e.status === 'pago' && hasPaidBRL(e)) return round2(Number(e.paidBRL));
  const base = total * (Number(rate) || 0);
  const markup = isCardPayment(e.paymentMethod) ? cardMarkupPct(trip) / 100 : 0;
  return round2(base * (1 + markup));
}

/** Pessoas entre as quais o gasto é dividido. */
export function splitPeople(e, trip) {
  const valid = new Set(trip.participants.map((p) => p.id));
  let people = (e.split?.people || []).filter((id) => valid.has(id));
  if (e.split?.mode === 'individual') people = people.slice(0, 1);
  if (!people.length) people = e.paidBy && valid.has(e.paidBy) ? [e.paidBy] : trip.participants.slice(0, 1).map((p) => p.id);
  return people;
}

const emptyStatus = () => ({ pago: 0, a_pagar: 0, estimado: 0, total: 0 });

export function summarize(trip, rates, opts = {}) {
  const rate = effectiveRate(trip, rates);
  const settleStatuses = opts.settleStatuses || ['pago', 'a_pagar'];
  const byStatus = emptyStatus();
  const byCurrency = {};
  const byCategory = new Map();
  const persons = new Map(
    trip.participants.map((p) => [p.id, { id: p.id, name: p.name, share: emptyStatus(), paid: 0, owed: 0 }])
  );
  let missingRate = false;
  const unassigned = { count: 0, total: 0 };

  for (const e of trip.expenses) {
    const brl = toBRL(e, trip, rate);
    const orig = expenseTotal(e);
    if (e.currency !== 'BRL' && !rate && !(e.status === 'pago' && hasPaidBRL(e))) missingRate = true;
    const st = e.status in byStatus ? e.status : 'estimado';
    byStatus[st] += brl;
    byStatus.total += brl;

    byCurrency[e.currency] ??= emptyStatus();
    byCurrency[e.currency][st] += orig;
    byCurrency[e.currency].total += orig;

    const cat = categoryOf(trip, e.categoryId);
    const c = byCategory.get(cat.id) || { id: cat.id, name: cat.name, color: cat.color, total: 0, pago: 0, pendente: 0 };
    c.total += brl;
    if (st === 'pago') c.pago += brl;
    else c.pendente += brl;
    byCategory.set(cat.id, c);

    const people = splitPeople(e, trip);
    const part = brl / people.length;
    const each = e.paidBy === PAYER_EACH;
    const payerKnown = each || persons.has(e.paidBy);
    // Sem pagador definido, o gasto fica fora do acerto (ninguém pagou ainda).
    const settles = settleStatuses.includes(st) && payerKnown;
    if (settleStatuses.includes(st) && !payerKnown) {
      unassigned.count++;
      unassigned.total += brl;
    }
    for (const pid of people) {
      const p = persons.get(pid);
      if (!p) continue;
      p.share[st] += part;
      p.share.total += part;
      if (settles) {
        p.owed += part;
        if (each) p.paid += part; // cada um pagou a própria parte
      }
    }
    if (settles && !each) persons.get(e.paidBy).paid += brl;
  }

  const perPerson = [...persons.values()].map((p) => ({ ...p, balance: round2(p.paid - p.owed) }));
  const categories = [...byCategory.values()].sort((a, b) => b.total - a.total);
  categories.forEach((c) => (c.color ||= PALETTE[0]));

  return {
    rate,
    missingRate,
    byStatus: roundAll(byStatus),
    byCurrency: Object.fromEntries(Object.entries(byCurrency).map(([k, v]) => [k, roundAll(v)])),
    categories,
    perPerson,
    settlement: settle(perPerson),
    unassigned: { count: unassigned.count, total: round2(unassigned.total) },
    upcoming: upcomingDue(trip, rate),
    detax: detaxSummary(trip, rate),
  };
}

function roundAll(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v)]));
}

/** Acerto de contas: lista mínima (gulosa) de transferências. */
export function settle(perPerson) {
  const debtors = perPerson.filter((p) => p.balance < -0.004).map((p) => ({ id: p.id, name: p.name, amt: -p.balance }));
  const creditors = perPerson.filter((p) => p.balance > 0.004).map((p) => ({ id: p.id, name: p.name, amt: p.balance }));
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    if (amt >= 0.01) out.push({ from: debtors[i].id, fromName: debtors[i].name, to: creditors[j].id, toName: creditors[j].name, amount: round2(amt) });
    debtors[i].amt -= amt;
    creditors[j].amt -= amt;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return out;
}

export function upcomingDue(trip, rate) {
  return trip.expenses
    .filter((e) => e.status === 'a_pagar')
    .map((e) => ({ ...e, brl: toBRL(e, trip, rate), total: expenseTotal(e) }))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
}

/**
 * Detax: soma das compras marcadas, agrupadas por loja + dia,
 * verificando o valor mínimo por loja/dia.
 */
export function detaxSummary(trip, rate) {
  const ratePct = Number(trip.detax?.ratePct) || 0;
  const min = Number(trip.detax?.minAmount) || 0;
  const groups = new Map();
  for (const e of trip.expenses) {
    if (!e.detax || e.currency === 'BRL') continue;
    const key = `${(e.vendor || e.description || '').trim().toLowerCase()}|${e.day || ''}`;
    const g = groups.get(key) || { vendor: e.vendor || e.description || '(sem loja)', day: e.day || '', total: 0, items: 0, currency: e.currency };
    g.total += expenseTotal(e);
    g.items++;
    groups.set(key, g);
  }
  const list = [...groups.values()].map((g) => ({
    ...g,
    total: round2(g.total),
    eligible: g.total >= min,
    refund: g.total >= min ? round2((g.total * ratePct) / 100) : 0,
  }));
  const refund = round2(list.reduce((s, g) => s + g.refund, 0));
  const purchases = round2(list.reduce((s, g) => s + g.total, 0));
  return { list, refund, refundBRL: round2(refund * (rate || 0)), purchases, ratePct, min, currency: trip.currency };
}

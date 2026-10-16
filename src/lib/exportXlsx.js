// Exportar gastos para .xlsx
import * as XLSX from 'xlsx';
import { STATUS, MOMENTS, TYPES, paymentLabel, categoryOf, personName, payerLabel } from './model.js';
import { expenseTotal, toBRL, summarize, splitPeople } from './money.js';

export function buildExpensesWorkbook(trip, rates) {
  const sum = summarize(trip, rates);
  const rate = sum.rate;
  const gastos = trip.expenses.map((e) => ({
    Descrição: e.description,
    'Local/fornecedor': e.vendor,
    Categoria: categoryOf(trip, e.categoryId).name,
    Quantidade: Number(e.qty) || 0,
    'Valor unitário': Number(e.unitPrice) || 0,
    'Valor total': expenseTotal(e),
    Moeda: e.currency,
    'Valor em R$': toBRL(e, trip, rate),
    'Pago em R$ (real)': e.paidBRL ?? '',
    Momento: MOMENTS[e.moment] || '',
    Dia: e.day || '',
    Tipo: TYPES[e.type] || '',
    Status: STATUS[e.status] || '',
    Vencimento: e.dueDate || '',
    'Forma de pagamento': paymentLabel(e.paymentMethod),
    'Quem pagou': payerLabel(trip, e.paidBy),
    Divisão: e.split?.mode === 'individual' ? 'Individual' : 'Igual',
    'Dividido entre': splitPeople(e, trip).map((id) => personName(trip, id)).join(', '),
    Detax: e.detax ? 'Sim' : '',
    Observação: e.note || '',
  }));

  const resumo = [
    ['Viagem', trip.name],
    ['Cotação usada', rate, `${trip.currency}/BRL`],
    ['Acréscimo do cartão (%)', (Number(trip.exchange.spreadPct) || 0) + (Number(trip.exchange.iofPct) || 0)],
    [],
    ['Total geral (R$)', sum.byStatus.total],
    ['Pago (R$)', sum.byStatus.pago],
    ['A pagar (R$)', sum.byStatus.a_pagar],
    ['Estimado (R$)', sum.byStatus.estimado],
    [],
    ['Totais por moeda original', 'Pago', 'A pagar', 'Estimado', 'Total'],
    ...Object.entries(sum.byCurrency).map(([cur, v]) => [cur, v.pago, v.a_pagar, v.estimado, v.total]),
    [],
    ['Por pessoa (R$)', 'Parte nos gastos', 'Pagou', 'Saldo'],
    ...sum.perPerson.map((p) => [p.name, round(p.share.total), round(p.paid), p.balance]),
    [],
    ['Acerto de contas', 'Para', 'Valor (R$)'],
    ...sum.settlement.map((s) => [s.fromName, s.toName, s.amount]),
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(resumo);
  ws1['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');
  const ws2 = XLSX.utils.json_to_sheet(gastos);
  ws2['!cols'] = Object.keys(gastos[0] || { a: 1 }).map((k) => ({ wch: Math.max(10, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Gastos');
  return wb;
}

const round = (v) => Math.round(v * 100) / 100;

export function exportExpensesXlsx(trip, rates) {
  const wb = buildExpensesWorkbook(trip, rates);
  const safe = trip.name.replace(/[^\w\- ]+/g, '').trim() || 'viagem';
  XLSX.writeFile(wb, `gastos-${safe}.xlsx`);
}

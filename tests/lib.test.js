import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { fmtMoney, dateRange, fmtDayShort } from '../src/lib/format.js';
import { newTrip, newExpense, parisSeed, syncDays } from '../src/lib/model.js';
import { toBRL, summarize, settle } from '../src/lib/money.js';
import { parseNumber, parseDate, suggestMapping, detectHeaderRow, rowsToExpenses, defaultImportDefaults, extractResumoTotals, compareWithResumo, mapSplit, readWorkbook, sheetRows, classifySheets } from '../src/lib/spreadsheet.js';
import { applyImport, buildBackup, parseBackup, mergeTrip } from '../src/lib/backup.js';
import { convertLegacy } from '../src/lib/legacy.js';
import { googleMapsDirUrl } from '../src/lib/geo.js';
import { buildExpensesWorkbook } from '../src/lib/exportXlsx.js';

const people = (trip) => trip.participants.map((p) => p.id);

describe('formatação', () => {
  it('formata moedas no padrão brasileiro', () => {
    expect(fmtMoney(1234.56, 'BRL')).toBe('R$ 1.234,56');
    expect(fmtMoney(1234.56, 'EUR')).toBe('€ 1.234,56');
  });
  it('gera os dias da viagem', () => {
    expect(dateRange('2026-11-10', '2026-11-14')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
    expect(fmtDayShort('2026-11-10')).toBe('ter, 10/11');
  });
});

describe('viagem Paris', () => {
  it('tem 5 dias, 4 pessoas e hospedagem', () => {
    const t = parisSeed();
    expect(t.days).toHaveLength(5);
    expect(t.participants).toHaveLength(4);
    expect(t.lodging.address).toMatch(/Blanc-Mesnil/);
    expect(t.currency).toBe('EUR');
  });
});

describe('câmbio e conversão', () => {
  const trip = newTrip({ currency: 'EUR', participants: ['A', 'B'] });
  trip.exchange = { spreadPct: 4, iofPct: 3.5, manualRate: null };
  it('BRL não converte', () => {
    expect(toBRL(newExpense(trip, { currency: 'BRL', qty: 2, unitPrice: 50 }), trip, 6)).toBe(100);
  });
  it('EUR no cartão aplica spread+IOF', () => {
    expect(toBRL(newExpense(trip, { currency: 'EUR', qty: 1, unitPrice: 100, paymentMethod: 'credito' }), trip, 6)).toBe(645);
  });
  it('EUR em dinheiro usa cotação pura', () => {
    expect(toBRL(newExpense(trip, { currency: 'EUR', qty: 1, unitPrice: 100, paymentMethod: 'dinheiro' }), trip, 6)).toBe(600);
  });
  it('EUR pago com valor real em reais usa o valor real', () => {
    expect(toBRL(newExpense(trip, { currency: 'EUR', qty: 1, unitPrice: 100, status: 'pago', paidBRL: 633.21 }), trip, 6)).toBe(633.21);
  });
  it('pendente ignora valor em reais e usa a cotação do dia', () => {
    expect(toBRL(newExpense(trip, { currency: 'EUR', qty: 1, unitPrice: 100, status: 'a_pagar', paidBRL: 1, paymentMethod: 'dinheiro' }), trip, 6)).toBe(600);
  });
});

describe('divisão e acerto de contas', () => {
  it('calcula totais por pessoa e quem deve para quem', () => {
    const trip = newTrip({ currency: 'EUR', participants: ['Ana', 'Bia', 'Caio', 'Duda'] });
    const [a, b, c, d] = people(trip);
    trip.exchange.manualRate = 6;
    trip.expenses = [
      newExpense(trip, { currency: 'BRL', unitPrice: 400, status: 'pago', paidBy: a, split: { mode: 'igual', people: [a, b, c, d] } }),
      newExpense(trip, { currency: 'BRL', unitPrice: 100, status: 'pago', paidBy: b, split: { mode: 'igual', people: [a, b] } }),
      newExpense(trip, { currency: 'BRL', unitPrice: 30, status: 'pago', paidBy: c, split: { mode: 'individual', people: [c] } }),
      newExpense(trip, { currency: 'BRL', unitPrice: 999, status: 'estimado', paidBy: d, split: { mode: 'igual', people: [a, b, c, d] } }),
    ];
    const s = summarize(trip, {});
    const by = Object.fromEntries(s.perPerson.map((p) => [p.name, p]));
    expect(by.Ana.balance).toBe(250); // pagou 400, deve 100+50
    expect(by.Bia.balance).toBe(-50); // pagou 100, deve 100+50
    expect(by.Caio.balance).toBe(-100);
    expect(by.Duda.balance).toBe(-100);
    const total = s.settlement.reduce((x, t) => x + t.amount, 0);
    expect(total).toBe(250);
    expect(s.settlement.every((t) => t.to === a)).toBe(true);
    expect(s.byStatus.estimado).toBe(999);
  });
  it('settle zera saldos', () => {
    const out = settle([
      { id: 1, name: 'A', balance: 10 },
      { id: 2, name: 'B', balance: -3.33 },
      { id: 3, name: 'C', balance: -6.67 },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('detax', () => {
  it('aplica mínimo por loja e dia', () => {
    const trip = newTrip({ currency: 'EUR' });
    trip.detax = { ratePct: 12, minAmount: 100.01 };
    trip.expenses = [
      newExpense(trip, { vendor: 'Galeries', day: '2026-11-12', unitPrice: 80, detax: true }),
      newExpense(trip, { vendor: 'Galeries', day: '2026-11-12', unitPrice: 50, detax: true }),
      newExpense(trip, { vendor: 'Sephora', day: '2026-11-12', unitPrice: 90, detax: true }),
    ];
    const s = summarize(trip, { EUR: { value: 6 } });
    expect(s.detax.refund).toBe(15.6);
    expect(s.detax.list.find((g) => g.vendor === 'Sephora').eligible).toBe(false);
  });
});

describe('planilha', () => {
  it('lê números em vários formatos', () => {
    expect(parseNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseNumber('€ 12,5')).toBe(12.5);
    expect(parseNumber('1,234.50')).toBe(1234.5);
    expect(parseNumber('1.500')).toBe(1500);
    expect(parseNumber('3.5')).toBe(3.5);
    expect(parseNumber('(10,00)')).toBe(-10);
    expect(parseNumber('abc')).toBeNaN();
  });
  it('lê datas', () => {
    expect(parseDate('12/11/2026')).toBe('2026-11-12');
    expect(parseDate('12/11', 2026)).toBe('2026-11-12');
    expect(parseDate(new Date(2026, 10, 12))).toBe('2026-11-12');
    expect(parseDate(46338)).toBe('2026-11-12');
  });
  it('sugere mapeamento pelo nome das colunas', () => {
    const m = suggestMapping(['Descrição', 'Local', 'Categoria', 'Qtd', 'Valor unitário', 'Total', 'Moeda', 'Status', 'Vencimento', 'Forma de pagamento', 'Quem pagou', 'Detax', 'Obs']);
    expect(m.description).toBe(0);
    expect(m.vendor).toBe(1);
    expect(m.qty).toBe(3);
    expect(m.unitPrice).toBe(4);
    expect(m.total).toBe(5);
    expect(m.currency).toBe(6);
    expect(m.paidBy).toBe(10);
    expect(m.detax).toBe(11);
    expect(m.note).toBe(12);
  });
  it('interpreta divisão', () => {
    const trip = newTrip({ participants: ['Ana', 'Bia', 'Caio'] });
    const [a, b] = people(trip);
    expect(mapSplit('todos', trip.participants).people).toHaveLength(3);
    expect(mapSplit('Ana e Bia', trip.participants)).toEqual({ mode: 'igual', people: [a, b] });
    expect(mapSplit('individual', trip.participants, b)).toEqual({ mode: 'individual', people: [b] });
  });

  it('importa uma planilha xlsx com Resumo, Gastos e Compras e confere o total', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Resumo da viagem'],
      ['Total em euros', 330],
      ['Total em reais', 1500],
    ]), 'Resumo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Gastos Paris'],
      ['Descrição', 'Categoria', 'Qtd', 'Valor unitário', 'Moeda', 'Status', 'Vencimento', 'Quem pagou'],
      ['Hotel', 'Hospedagem', 1, 300, 'EUR', 'Pago', '', 'Bia'],
      ['Seguro', 'Seguro', 4, 375, 'BRL', 'a pagar', '01/11/2026', ''],
      ['Total', '', '', '', '', '', '', ''],
      ['', 'linha sem valor', '', 'abc', '', '', '', ''],
    ]), 'Gastos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Item', 'Loja', 'Valor', 'Detax'],
      ['Perfume', 'Sephora', '€ 30,00', 'sim'],
    ]), 'Compras');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const book = readWorkbook(buf, 'teste.xlsx');
    const roles = classifySheets(book.SheetNames);
    expect(roles.map((r) => r.role)).toEqual(['resumo', 'gastos', 'compras']);

    const trip = newTrip({ currency: 'EUR', participants: ['Ana', 'Bia'], startDate: '2026-11-10', endDate: '2026-11-14' });
    const g = sheetRows(book, 'Gastos');
    const h = detectHeaderRow(g.raw);
    expect(h).toBe(1);
    const res = rowsToExpenses(g, h, suggestMapping(g.raw[h]), defaultImportDefaults(trip), trip);
    const ok = res.rows.filter((r) => r.include);
    expect(ok).toHaveLength(2);
    expect(ok[0].expense.paidBy).toBe(trip.participants[1].id);
    expect(ok[0].expense.categoryId).toBe('hospedagem');
    expect(ok[1].expense.categoryId).toBe('documentos');
    expect(ok[1].expense.status).toBe('a_pagar');
    expect(ok[1].expense.dueDate).toBe('2026-11-01');
    expect(ok[1].expense.currency).toBe('BRL');
    expect(res.rows.filter((r) => !r.include).length).toBeGreaterThanOrEqual(1);

    const c = sheetRows(book, 'Compras');
    const ch = detectHeaderRow(c.raw);
    const cres = rowsToExpenses(c, ch, suggestMapping(c.raw[ch]), defaultImportDefaults(trip, 'compras'), trip, 'compras');
    expect(cres.rows[0].expense.detax).toBe(true);
    expect(cres.rows[0].expense.unitPrice).toBe(30);
    expect(cres.rows[0].expense.categoryId).toBe('compras');

    const totals = extractResumoTotals(sheetRows(book, 'Resumo'));
    expect(totals.map((t) => t.currency)).toEqual(['EUR', 'BRL']);
    const all = [...ok, ...cres.rows].map((r) => r.expense);
    const cmp = compareWithResumo(totals, all, trip, 6);
    expect(cmp[0].ok).toBe(true); // 330 EUR
    expect(cmp[1].ok).toBe(true); // 1500 BRL
  });

  it('lê CSV com ponto e vírgula', () => {
    const csv = 'Descrição;Valor;Moeda\nJantar;R$ 120,50;BRL\n';
    const book = readWorkbook(new TextEncoder().encode(csv), 'gastos.csv');
    const rows = sheetRows(book, book.SheetNames[0]);
    expect(rows.raw[1][0]).toBe('Jantar');
    const trip = newTrip({ currency: 'EUR' });
    const res = rowsToExpenses(rows, 0, suggestMapping(rows.raw[0]), defaultImportDefaults(trip), trip);
    expect(res.rows[0].expense.unitPrice).toBe(120.5);
    expect(res.rows[0].expense.currency).toBe('BRL');
  });
});

describe('backup', () => {
  it('exporta e substitui', () => {
    const t = parisSeed();
    const b = parseBackup(JSON.stringify(buildBackup({ trips: [t] })));
    const r = applyImport([newTrip({ name: 'outra' })], b, 'replace');
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0].name).toBe('Paris 2026');
  });
  it('mescla item a item e respeita exclusões', () => {
    const base = parisSeed();
    base.expenses = [newExpense(base, { id: 'e1', description: 'A', updatedAt: 1 }), newExpense(base, { id: 'e2', description: 'B', updatedAt: 1 })];
    const phone = structuredClone(base);
    const pc = structuredClone(base);
    phone.expenses[0] = { ...phone.expenses[0], description: 'A editado', updatedAt: 5 };
    phone.expenses.push(newExpense(phone, { id: 'e3', description: 'C', updatedAt: 6 }));
    pc.expenses = pc.expenses.filter((e) => e.id !== 'e2');
    pc.deleted = { e2: 4 };
    const m = mergeTrip(pc, phone);
    expect(m.expenses.map((e) => e.description).sort()).toEqual(['A editado', 'C']);
  });
  it('não duplica a viagem inicial intocada de um aparelho novo', () => {
    const pc = parisSeed();
    pc.updatedAt = pc.createdAt + 10;
    const phoneSeed = parisSeed();
    const r = applyImport([phoneSeed], buildBackup({ trips: [pc] }), 'merge');
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0].id).toBe(pc.id);
  });
  it('rejeita arquivo que não é backup', () => {
    expect(() => parseBackup('{"a":1}')).toThrow();
  });
});

describe('formato antigo', () => {
  it('converte JSON do viagens.html', () => {
    const old = {
      nome: 'Lisboa',
      destino: 'Lisboa',
      dataInicio: '2025-05-01',
      dataFim: '2025-05-03',
      numeroPessoas: 2,
      cambio: { oficial: 6.2, spread: 4, iof: 3.38 },
      gastos: [{ descricao: 'Hotel', categoria: 'Hospedagem', valor: 300, moeda: 'EUR', status: 'pago' }],
      compras: [{ item: 'Vinho', loja: 'Garrafeira', valor: '20,00', detax: true }],
      transporteFixo: [{ tipo: 'Voo', de: 'GRU', para: 'LIS', data: '2025-05-01', hora: '22:00', valor: 3000, moeda: 'BRL' }],
      roteiro: [{ data: '2025-05-01', tema: 'Chegada', atividades: [{ horario: '10:00', local: 'Belém', endereco: 'Belém, Lisboa', deslocamento: { tempo: '20 min', meio: 'Tram', linha: '15E' }, custo: 10 }] }],
      checklist: [{ texto: 'Passaporte', feito: true }],
      riscos: ['Último metrô 1h'],
    };
    const { trips, report } = convertLegacy(JSON.stringify(JSON.stringify(old)));
    const t = trips[0];
    expect(t.name).toBe('Lisboa');
    expect(t.days).toHaveLength(3);
    expect(t.days[0].theme).toBe('Chegada');
    expect(t.exchange.manualRate).toBe(6.2);
    expect(t.expenses).toHaveLength(3);
    expect(t.expenses[1].detax).toBe(true);
    expect(t.expenses[1].categoryId).toBe('compras');
    expect(t.expenses[2].currency).toBe('BRL');
    expect(t.transports[0].from).toBe('GRU');
    expect(t.activities[0].transfer).toMatchObject({ duration: '20 min', mode: 'Tram', line: '15E' });
    expect(t.checklist[0].done).toBe(true);
    expect(t.risks[0].text).toBe('Último metrô 1h');
    expect(report[0].ignored).toContain('numeroPessoas');
  });
});

describe('Google Maps e exportação', () => {
  it('monta link de rota com paradas', () => {
    const url = googleMapsDirUrl([{ lat: 48.9, lng: 2.4 }, { lat: 48.86, lng: 2.33 }, { lat: 48.85, lng: 2.29 }], 'walking');
    expect(url).toContain('origin=48.900000%2C2.400000');
    expect(url).toContain('waypoints=48.860000%2C2.330000');
  });
  it('gera planilha de gastos', () => {
    const t = parisSeed();
    t.expenses = [newExpense(t, { description: 'Museu', unitPrice: 20, qty: 4 })];
    const wb = buildExpensesWorkbook(t, { EUR: { value: 6 } });
    expect(wb.SheetNames).toEqual(['Resumo', 'Gastos']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Gastos);
    expect(rows[0]['Valor total']).toBe(80);
  });
});

describe('dias', () => {
  it('syncDays mantém temas', () => {
    const t = newTrip({ startDate: '2026-11-10', endDate: '2026-11-11' });
    t.days[0].theme = 'Chegada';
    t.endDate = '2026-11-12';
    syncDays(t);
    expect(t.days.map((d) => d.theme)).toEqual(['Chegada', '', '']);
  });
});

describe('quem pagou: a definir e cada um a sua parte', () => {
  it('cada um pagou a sua parte não gera dívida e conta como pago por todos', () => {
    const trip = newTrip({ currency: 'EUR', participants: ['Kety', 'Marcelo', 'Gustavo', 'Iramaia'] });
    const ids = people(trip);
    trip.expenses = [newExpense(trip, { currency: 'BRL', unitPrice: 2500, status: 'pago', paidBy: '__cada_um__', split: { mode: 'igual', people: ids } })];
    const s = summarize(trip, {});
    expect(s.settlement).toHaveLength(0);
    expect(s.perPerson.every((p) => p.paid === 625 && p.balance === 0)).toBe(true);
  });
  it('pagador a definir fica fora do acerto, mas conta na parte de cada um', () => {
    const trip = newTrip({ currency: 'EUR', participants: ['A', 'B'] });
    const [a, b] = people(trip);
    trip.expenses = [
      newExpense(trip, { currency: 'BRL', unitPrice: 100, status: 'a_pagar', paidBy: '', split: { mode: 'igual', people: [a, b] } }),
      newExpense(trip, { currency: 'BRL', unitPrice: 50, status: 'pago', paidBy: a, split: { mode: 'igual', people: [a, b] } }),
    ];
    const s = summarize(trip, {});
    expect(s.unassigned).toEqual({ count: 1, total: 100 });
    expect(s.settlement).toEqual([expect.objectContaining({ from: b, to: a, amount: 25 })]);
    expect(s.perPerson[0].share.total).toBe(75);
  });
  it('gasto novo começa com pagador a definir', () => {
    expect(newExpense(newTrip({ participants: ['A', 'B'] })).paidBy).toBe('');
  });
});

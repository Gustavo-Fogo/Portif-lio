import { useMemo, useState } from 'react';
import { useStore, go, upsertItem, removeItem } from '../lib/store.jsx';
import { STATUS, MOMENTS, TYPES, PAYMENT_METHODS, categoryOf, PAYER_EACH } from '../lib/model.js';
import { effectiveRate } from '../lib/money.js';
import { fmtMoney } from '../lib/format.js';
import {
  FIELDS, readWorkbook, sheetRows, classifySheets, detectHeaderRow, suggestMapping,
  rowsToExpenses, defaultImportDefaults, extractResumoTotals, compareWithResumo,
} from '../lib/spreadsheet.js';
import { Card, Field, Segmented, Chips, Badge, readFileAs, toast } from '../components/ui.jsx';

const ROLES = [['gastos', 'Gastos'], ['compras', 'Compras'], ['resumo', 'Resumo'], ['ignorar', 'Ignorar']];

export default function ImportSheet({ trip }) {
  const { updateTrip, rates } = useStore();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [defaults, setDefaults] = useState(() => defaultImportDefaults(trip));
  const [err, setErr] = useState('');
  const [excluded, setExcluded] = useState({}); // chave "aba:linha" -> true/false (sobrescreve include)
  const [replacePrev, setReplacePrev] = useState(false);
  const [result, setResult] = useState(null);
  const rate = effectiveRate(trip, rates);

  async function onFile(file) {
    setErr('');
    try {
      const data = await readFileAs(file, 'buffer');
      const wb = readWorkbook(data, file.name);
      const roles = classifySheets(wb.SheetNames);
      const list = roles.map(({ name, role }) => {
        const rows = sheetRows(wb, name);
        const headerRow = detectHeaderRow(rows.raw);
        return {
          name,
          role,
          rows,
          headerRow,
          mapping: suggestMapping(rows.raw[headerRow] || []),
          catDefault: role === 'compras' ? 'compras' : 'outros',
          momentDefault: role === 'compras' ? 'durante' : 'antes',
          detaxDefault: false,
        };
      });
      if (!list.some((s) => s.role === 'gastos' || s.role === 'compras')) list.forEach((s) => s.role === 'ignorar' && s.rows.raw.length > 1 && (s.role = 'gastos'));
      setFileName(file.name);
      setSheets(list);
      setStep(2);
    } catch (e) {
      setErr('Não foi possível ler o arquivo: ' + e.message);
    }
  }

  const upd = (i, patch) => setSheets((l) => l.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const dataSheets = sheets.filter((s) => s.role === 'gastos' || s.role === 'compras');
  const resumoSheet = sheets.find((s) => s.role === 'resumo');

  const preview = useMemo(() => {
    if (step < 3) return null;
    const rows = [];
    const newCategories = [];
    const tripForParse = { ...trip, categories: [...trip.categories] };
    for (const s of dataSheets) {
      const d = { ...defaults, categoryId: s.catDefault, moment: s.momentDefault, detax: s.detaxDefault, type: s.role === 'compras' ? 'flexivel' : defaults.type };
      const r = rowsToExpenses(s.rows, s.headerRow, s.mapping, d, tripForParse, s.role);
      tripForParse.categories.push(...r.newCategories);
      newCategories.push(...r.newCategories);
      rows.push(...r.rows.map((x) => ({ ...x, sheet: s.name, role: s.role, key: `${s.name}:${x.rowNumber}` })));
    }
    return { rows, newCategories, tripForParse };
  }, [step, sheets, defaults]);

  const included = (r) => (r.key in excluded ? !excluded[r.key] : r.include);

  async function confirmImport() {
    const chosen = preview.rows.filter(included);
    const usedCats = new Set(chosen.map((r) => r.expense.categoryId));
    const cats = preview.newCategories.filter((c) => usedCats.has(c.id));
    await updateTrip(trip.id, (t) => {
      if (replacePrev) for (const e of [...t.expenses]) if (String(e.source).startsWith('planilha')) removeItem(t, 'expenses', e.id);
      for (const c of cats) upsertItem(t, 'categories', c);
      for (const r of chosen) upsertItem(t, 'expenses', r.expense);
    });
    const resumoTotals = resumoSheet ? extractResumoTotals(resumoSheet.rows) : [];
    const byRole = { Gastos: chosen.filter((r) => r.role === 'gastos').map((r) => r.expense), Compras: chosen.filter((r) => r.role === 'compras').map((r) => r.expense) };
    const comparison = compareWithResumo(resumoTotals, chosen.map((r) => r.expense), preview.tripForParse, rate, byRole);
    setResult({ count: chosen.length, comparison, hadResumo: !!resumoSheet });
    setStep(4);
    toast(`${chosen.length} gastos importados.`);
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="btn btn-ghost" onClick={() => go(`/v/${trip.id}/financeiro`)}>← Voltar</button>
          <h1 className="topbar-title">Importar planilha</h1>
        </div>
        <ol className="steps">
          {['Arquivo', 'Colunas e padrões', 'Prévia', 'Conferência'].map((s, i) => (
            <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>{i + 1}. {s}</li>
          ))}
        </ol>
      </header>
      <main className="container stack-gap">
        {err && <div className="alert alert-danger">{err}</div>}

        {step === 1 && (
          <Card title="Escolha a planilha">
            <p>Formatos aceitos: <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong>. Abas esperadas: <em>Resumo</em>, <em>Gastos</em> e <em>Compras</em> (outros nomes podem ser escolhidos no próximo passo).</p>
            <label className="file-drop">
              <input type="file" accept=".xlsx,.xls,.xlsm,.csv,.txt" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
              <span>📄 Toque para escolher o arquivo</span>
            </label>
          </Card>
        )}

        {step === 2 && (
          <>
            <p className="muted">Arquivo: <strong>{fileName}</strong>. Confira o papel de cada aba e qual coluna corresponde a cada campo.</p>
            {sheets.map((s, i) => (
              <Card key={s.name} title={`Aba “${s.name}”`} actions={<select value={s.role} onChange={(e) => upd(i, { role: e.target.value, ...(e.target.value === 'compras' ? { catDefault: 'compras', momentDefault: 'durante' } : {}) })} aria-label="Papel da aba">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}>
                {(s.role === 'gastos' || s.role === 'compras') && (
                  <SheetMapping trip={trip} sheet={s} onChange={(patch) => upd(i, patch)} />
                )}
                {s.role === 'resumo' && <ResumoPreview sheet={s} />}
                {s.role === 'ignorar' && <p className="small muted">Esta aba não será importada ({s.rows.raw.length} linhas).</p>}
              </Card>
            ))}

            <Card title="Valores padrão para campos ausentes">
              <p className="small muted">Usados quando a planilha não tem a coluna ou a célula está vazia.</p>
              <div className="grid-2">
                <Field label="Moeda padrão">
                  <Segmented value={defaults.currency} onChange={(v) => setDefaults({ ...defaults, currency: v })} options={[...new Set([trip.currency, 'BRL'])].map((c) => [c, c])} />
                </Field>
                <Field label="Status padrão">
                  <select value={defaults.status} onChange={(e) => setDefaults({ ...defaults, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </Field>
                <Field label="Tipo padrão (aba Gastos)">
                  <select value={defaults.type} onChange={(e) => setDefaults({ ...defaults, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </Field>
                <Field label="Forma de pagamento padrão">
                  <select value={defaults.paymentMethod} onChange={(e) => setDefaults({ ...defaults, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                </Field>
                <Field label="Quem pagou (padrão)">
                  <select value={defaults.paidBy} onChange={(e) => setDefaults({ ...defaults, paidBy: e.target.value })}>
                    <option value="">A definir (ainda não pago)</option>
                    <option value={PAYER_EACH}>Cada um pagou a sua parte</option>
                    {trip.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Divisão padrão">
                  <Segmented value={defaults.splitMode} onChange={(v) => setDefaults({ ...defaults, splitMode: v })} options={[['individual', 'Individual'], ['igual', 'Dividido igualmente']]} />
                </Field>
              </div>
              {defaults.splitMode === 'igual' && (
                <Field label="Dividir entre">
                  <Chips
                    options={trip.participants.map((p) => [p.id, p.name])}
                    selected={defaults.splitPeople}
                    onToggle={(id) => setDefaults({ ...defaults, splitPeople: defaults.splitPeople.includes(id) ? defaults.splitPeople.filter((x) => x !== id) : [...defaults.splitPeople, id] })}
                  />
                </Field>
              )}
              <label className="check">
                <input type="checkbox" checked={defaults.createCategories} onChange={(e) => setDefaults({ ...defaults, createCategories: e.target.checked })} />
                <span>Criar categorias novas quando a planilha tiver uma categoria desconhecida</span>
              </label>
            </Card>
            <div className="btn-row">
              <button className="btn" onClick={() => setStep(1)}>Trocar arquivo</button>
              <button className="btn btn-primary btn-lg" disabled={!dataSheets.length || (defaults.splitMode === 'igual' && !defaults.splitPeople.length)} onClick={() => { setExcluded({}); setStep(3); }}>
                Ver prévia →
              </button>
            </div>
          </>
        )}

        {step === 3 && preview && (
          <>
            <PreviewTable trip={preview.tripForParse} rows={preview.rows} included={included} toggle={(r) => setExcluded({ ...excluded, [r.key]: included(r) })} />
            <label className="check">
              <input type="checkbox" checked={replacePrev} onChange={(e) => setReplacePrev(e.target.checked)} />
              <span>Apagar antes os gastos importados de planilha anteriormente ({trip.expenses.filter((e) => String(e.source).startsWith('planilha')).length}) — use ao reimportar a planilha atualizada</span>
            </label>
            <div className="btn-row">
              <button className="btn" onClick={() => setStep(2)}>← Ajustar colunas</button>
              <button className="btn btn-primary btn-lg" disabled={!preview.rows.some(included)} onClick={confirmImport}>
                Importar {preview.rows.filter(included).length} gastos
              </button>
            </div>
          </>
        )}

        {step === 4 && result && (
          <>
            <div className="alert alert-ok">✅ {result.count} gastos importados para “{trip.name}”.</div>
            <Card title="Conferência com a aba Resumo">
              {!result.hadResumo && <p className="muted">A planilha não tinha aba Resumo para conferir.</p>}
              {result.hadResumo && !result.comparison.length && <p className="muted">Não encontrei totais na aba Resumo (procuro células com a palavra “total” seguidas de um número).</p>}
              {result.comparison.length > 0 && (
                <>
                  {result.comparison.some((c) => !c.ok) ? (
                    <div className="alert alert-warn">Há diferença entre o total da aba Resumo e o que foi importado. Confira linhas excluídas, moedas e linhas de subtotal.</div>
                  ) : (
                    <div className="alert alert-ok">Os totais conferem com a aba Resumo.</div>
                  )}
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Na aba Resumo</th><th className="num">Valor</th><th>Comparado com</th><th className="num">Importado</th><th className="num">Diferença</th></tr></thead>
                      <tbody>
                        {result.comparison.map((c, i) => (
                          <tr key={i} className={c.ok ? '' : 'row-warn'}>
                            <td>{c.label}</td>
                            <td className="num">{fmtMoney(c.value, c.currency || c.match?.currency || 'BRL')}</td>
                            <td className="small">{c.match?.label}</td>
                            <td className="num">{fmtMoney(c.match?.value, c.match?.currency)}</td>
                            <td className="num">{c.ok ? '✓' : fmtMoney(c.diff, c.match?.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small muted">Valores em reais dependem da cotação atual ({fmtMoney(rate, 'BRL')}) e do acréscimo do cartão; pequenas diferenças são esperadas quando a planilha usou outra cotação.</p>
                </>
              )}
            </Card>
            <div className="btn-row">
              <button className="btn btn-primary btn-lg" onClick={() => go(`/v/${trip.id}/financeiro`)}>Ver no Financeiro</button>
              <button className="btn" onClick={() => go(`/v/${trip.id}/resumo`)}>Ver Resumo</button>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function SheetMapping({ trip, sheet, onChange }) {
  const headers = sheet.rows.raw[sheet.headerRow] || [];
  const sample = sheet.rows.text[sheet.headerRow + 1] || [];
  const cols = headers.map((h, i) => [i, `${colLetter(i)} · ${String(h || '(sem título)').slice(0, 30)}`]);
  return (
    <>
      <div className="grid-3">
        <Field label="Linha do cabeçalho">
          <select value={sheet.headerRow} onChange={(e) => { const h = Number(e.target.value); onChange({ headerRow: h, mapping: suggestMapping(sheet.rows.raw[h] || []) }); }}>
            {sheet.rows.raw.slice(0, 15).map((r, i) => (
              <option key={i} value={i}>Linha {i + 1}: {r.filter(Boolean).slice(0, 3).join(' | ').slice(0, 40)}</option>
            ))}
          </select>
        </Field>
        <Field label="Categoria padrão">
          <select value={sheet.catDefault} onChange={(e) => onChange({ catDefault: e.target.value })}>{trip.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Momento padrão">
          <select value={sheet.momentDefault} onChange={(e) => onChange({ momentDefault: e.target.value })}>{Object.entries(MOMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={sheet.detaxDefault} onChange={(e) => onChange({ detaxDefault: e.target.checked })} />
        <span>Marcar Detax por padrão nesta aba</span>
      </label>
      <div className="table-wrap">
        <table className="table mapping">
          <thead><tr><th>Campo do sistema</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead>
          <tbody>
            {FIELDS.map((f) => {
              const idx = sheet.mapping[f.key];
              return (
                <tr key={f.key} className={idx >= 0 ? 'mapped' : ''}>
                  <td>{f.label}</td>
                  <td>
                    <select value={idx} onChange={(e) => onChange({ mapping: { ...sheet.mapping, [f.key]: Number(e.target.value) } })} aria-label={f.label}>
                      <option value={-1}>— não tem —</option>
                      {cols.map(([i, l]) => <option key={i} value={i}>{l}</option>)}
                    </select>
                  </td>
                  <td className="small muted">{idx >= 0 ? String(sample[idx] ?? '') : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">Basta mapear <strong>Descrição</strong> e <strong>Valor total</strong> (ou Valor unitário). Os demais campos usam os padrões abaixo.</p>
    </>
  );
}

function ResumoPreview({ sheet }) {
  const totals = extractResumoTotals(sheet.rows);
  return totals.length ? (
    <>
      <p className="small">Totais encontrados (serão comparados depois da importação):</p>
      <ul className="small">
        {totals.map((t, i) => <li key={i}>{t.label}: <strong>{t.currency ? fmtMoney(t.value, t.currency) : t.value.toLocaleString('pt-BR')}</strong></li>)}
      </ul>
    </>
  ) : (
    <p className="small muted">Nenhum total encontrado nesta aba.</p>
  );
}

function PreviewTable({ trip, rows, included, toggle }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const errors = rows.filter((r) => r.problems.some((p) => p.level === 'erro')).length;
  const warns = rows.filter((r) => r.problems.some((p) => p.level === 'aviso') && !r.problems.some((p) => p.level === 'erro')).length;
  const shown = onlyProblems ? rows.filter((r) => r.problems.length) : rows;
  const totals = {};
  for (const r of rows) if (included(r)) totals[r.expense.currency] = (totals[r.expense.currency] || 0) + r.expense.qty * r.expense.unitPrice;
  return (
    <Card title={`Prévia: ${rows.length} linhas`}>
      <div className="badges">
        <Badge kind="ok">{rows.filter(included).length} selecionadas</Badge>
        {errors > 0 && <Badge kind="danger">{errors} com erro (desmarcadas)</Badge>}
        {warns > 0 && <Badge kind="warn">{warns} com aviso</Badge>}
        {Object.entries(totals).map(([c, v]) => <Badge key={c}>{fmtMoney(v, c)}</Badge>)}
      </div>
      <label className="check small">
        <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> <span>Mostrar só linhas com problema</span>
      </label>
      <div className="table-wrap">
        <table className="table preview rtable">
          <thead>
            <tr><th>Linha</th><th>Descrição</th><th className="num">Valor</th><th>Status</th><th>Categoria</th><th>Problemas</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const lvl = r.problems.some((p) => p.level === 'erro') ? 'row-error' : r.problems.length ? 'row-warn' : '';
              const e = r.expense;
              return (
                <tr key={r.key} className={lvl + (included(r) ? '' : ' row-off')}>
                  <td className="rt-head">
                    <label className="check small">
                      <input type="checkbox" checked={included(r)} onChange={() => toggle(r)} aria-label={`Incluir linha ${r.rowNumber} da aba ${r.sheet}`} />
                      <span>{r.sheet} {r.rowNumber}</span>
                    </label>
                  </td>
                  <td data-label="Descrição"><span>{e.description}{e.vendor && <span className="small muted block">{e.vendor}</span>}{e.detax && <Badge kind="info">Detax</Badge>}</span></td>
                  <td className="num" data-label="Valor"><span>{fmtMoney(e.qty * e.unitPrice, e.currency)}{e.qty !== 1 && <span className="small muted block">{e.qty} × {fmtMoney(e.unitPrice, e.currency)}</span>}</span></td>
                  <td className="small" data-label="Status"><span>{STATUS[e.status]}{e.dueDate && <span className="muted block">vence {e.dueDate.split('-').reverse().join('/')}</span>}</span></td>
                  <td className="small" data-label="Categoria">{categoryOf(trip, e.categoryId).name}</td>
                  {r.problems.length > 0 ? (
                    <td className="small problems">{r.problems.map((p, i) => <div key={i} className={p.level === 'erro' ? 'text-danger' : 'text-warn'}>{p.level === 'erro' ? '✖' : '⚠'} {p.msg}</div>)}</td>
                  ) : (
                    <td className="small muted hide-mobile">—</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function colLetter(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

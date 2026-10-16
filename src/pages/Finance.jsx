import { useMemo, useState } from 'react';
import { useStore, go } from '../lib/store.jsx';
import { STATUS_SHORT, MOMENTS, categoryOf, personName, paymentLabel, PAYER_EACH, isPerson } from '../lib/model.js';
import { expenseTotal, toBRL, effectiveRate, cardMarkupPct, splitPeople } from '../lib/money.js';
import { fmtBRL, fmtMoney, fmtRate, fmtDateTime, fmtDayShort, fmtDate } from '../lib/format.js';
import { Card, NumberInput, Field, Badge, toast } from '../components/ui.jsx';
import ExpenseForm from './ExpenseForm.jsx';

const statusKind = { pago: 'ok', a_pagar: 'warn', estimado: 'info' };

export default function Finance({ trip }) {
  const { rates, refreshRate, updateTrip } = useStore();
  const [editing, setEditing] = useState(null); // null | 'new' | expense
  const [f, setF] = useState({ status: '', category: '', currency: '', moment: '', person: '', q: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState(false);
  const rate = effectiveRate(trip, rates);
  const rateInfo = rates[trip.currency];

  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return trip.expenses
      .filter((e) => !f.status || e.status === f.status)
      .filter((e) => !f.category || e.categoryId === f.category)
      .filter((e) => !f.currency || e.currency === f.currency)
      .filter((e) => !f.moment || e.moment === f.moment)
      .filter((e) => !f.person || e.paidBy === f.person || splitPeople(e, trip).includes(f.person))
      .filter((e) => !q || `${e.description} ${e.vendor} ${e.note}`.toLowerCase().includes(q))
      .sort((a, b) => (a.moment === b.moment ? (a.day || a.dueDate || '').localeCompare(b.day || b.dueDate || '') : a.moment === 'antes' ? -1 : 1));
  }, [trip, f]);

  const totals = useMemo(() => {
    let brl = 0;
    let personShare = 0;
    const byCur = {};
    for (const e of list) {
      const v = toBRL(e, trip, rate);
      brl += v;
      byCur[e.currency] = (byCur[e.currency] || 0) + expenseTotal(e);
      if (f.person) {
        const people = splitPeople(e, trip);
        if (people.includes(f.person)) personShare += v / people.length;
      }
    }
    return { brl, byCur, personShare };
  }, [list, trip, rate, f.person]);

  const activeFilters = Object.entries(f).filter(([k, v]) => v && k !== 'q').length;

  async function doRefresh() {
    setBusy(true);
    try {
      const r = await refreshRate(trip.currency);
      toast(`Cotação atualizada: R$ ${fmtRate(r.value)}`);
    } catch (e) {
      toast(navigator.onLine ? e.message : 'Sem internet. Usando a última cotação salva.', 'warn');
    } finally {
      setBusy(false);
    }
  }

  const setExchange = (patch) => updateTrip(trip.id, (t) => (t.exchange = { ...t.exchange, ...patch }));

  return (
    <div className="stack-gap">
      {trip.currency !== 'BRL' && (
        <Card title="Câmbio" className="rate-card">
          <div className="rate-grid">
            <div>
              <div className="small muted">Oficial (comercial)</div>
              <div className="rate-value">1 {trip.currency} = R$ {fmtRate(rateInfo?.value || 0)}</div>
              <div className="small muted">
                {rateInfo ? `${rateInfo.source} · cotação de ${fmtDateTime(rateInfo.quotedAt || rateInfo.fetchedAt)} · buscada em ${fmtDateTime(rateInfo.fetchedAt)}` : 'Ainda não buscada.'}
              </div>
              <button className="btn btn-small" onClick={doRefresh} disabled={busy}>{busy ? 'Buscando…' : '↻ Atualizar cotação'}</button>
            </div>
            <div>
              <div className="small muted">No cartão (spread + IOF)</div>
              <div className="rate-value">R$ {fmtRate(rate * (1 + cardMarkupPct(trip) / 100))}</div>
              <div className="grid-2 tight">
                <Field label="Spread (%)">
                  <NumberInput value={trip.exchange.spreadPct} onChange={(v) => setExchange({ spreadPct: v })} />
                </Field>
                <Field label="IOF (%)">
                  <NumberInput value={trip.exchange.iofPct} onChange={(v) => setExchange({ iofPct: v })} />
                </Field>
              </div>
            </div>
            <div>
              <Field label="Cotação manual (opcional)" hint="Se preenchida, substitui a cotação automática em todos os cálculos.">
                <NumberInput value={trip.exchange.manualRate} allowEmpty placeholder="automática" onChange={(v) => setExchange({ manualRate: v > 0 ? v : null })} />
              </Field>
            </div>
          </div>
          <p className="small muted">
            Gastos pendentes e estimados usam a cotação{trip.exchange.manualRate ? ' manual' : ' do dia'}. Os pagos no cartão recebem +{cardMarkupPct(trip).toLocaleString('pt-BR')}%. Gastos já pagos em {trip.currency} podem guardar o valor real cobrado em reais.
          </p>
        </Card>
      )}

      <div className="btn-row">
        <button className="btn btn-primary btn-lg" onClick={() => setEditing('new')}>+ Novo gasto</button>
        <button className="btn" onClick={() => go(`/v/${trip.id}/importar`)}>Importar planilha</button>
        <button
          className="btn"
          onClick={async () => {
            const { exportExpensesXlsx } = await import('../lib/exportXlsx.js');
            exportExpensesXlsx(trip, rates);
          }}
          disabled={!trip.expenses.length}
        >
          Exportar .xlsx
        </button>
      </div>

      <div className="filters">
        <div className="row-input">
          <input type="search" placeholder="Buscar gasto…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar gasto" />
          <button className={'btn' + (activeFilters ? ' btn-active' : '')} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
        {showFilters && (
          <div className="filter-grid">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {trip.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} aria-label="Moeda">
              <option value="">Todas as moedas</option>
              {[...new Set([trip.currency, 'BRL', ...trip.expenses.map((e) => e.currency)])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={f.moment} onChange={(e) => setF({ ...f, moment: e.target.value })} aria-label="Momento">
              <option value="">Antes e durante</option>
              {Object.entries(MOMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} aria-label="Pessoa">
              <option value="">Todas as pessoas</option>
              {trip.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {activeFilters > 0 && <button className="btn btn-ghost" onClick={() => setF({ status: '', category: '', currency: '', moment: '', person: '', q: f.q })}>Limpar filtros</button>}
          </div>
        )}
      </div>

      <div className="list-total">
        <span>{list.length} {list.length === 1 ? 'gasto' : 'gastos'}</span>
        <span>
          <strong>{fmtBRL(totals.brl)}</strong>
          {Object.entries(totals.byCur).filter(([c]) => c !== 'BRL').map(([c, v]) => <span key={c} className="muted"> · {fmtMoney(v, c)}</span>)}
        </span>
        {f.person && <span className="small">Parte de {personName(trip, f.person)}: <strong>{fmtBRL(totals.personShare)}</strong></span>}
      </div>

      {!trip.expenses.length && <div className="empty">Nenhum gasto ainda. Adicione um gasto ou importe sua planilha.</div>}

      <ul className="expense-list">
        {list.map((e) => {
          const cat = categoryOf(trip, e.categoryId);
          const people = splitPeople(e, trip);
          return (
            <li key={e.id}>
              <button className="expense" onClick={() => setEditing(e)} style={{ borderLeftColor: cat.color }}>
                <div className="expense-main">
                  <strong>{e.description}</strong>
                  <span className="small muted">
                    {[cat.name, e.vendor, e.moment === 'durante' ? (e.day ? fmtDayShort(e.day) : 'durante') : 'antes', paymentLabel(e.paymentMethod)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="small">
                    {e.paidBy === PAYER_EACH ? 'Cada um pagou a sua parte' : isPerson(trip, e.paidBy) ? `${personName(trip, e.paidBy)} pagou` : 'Pagador a definir'} · {e.split.mode === 'individual' ? `de ${personName(trip, people[0])}` : people.length === trip.participants.length ? 'dividido entre todos' : `dividido: ${people.map((p) => personName(trip, p)).join(', ')}`}
                  </span>
                  <span className="badges">
                    <Badge kind={statusKind[e.status]}>{STATUS_SHORT[e.status]}</Badge>
                    {e.status === 'a_pagar' && e.dueDate && <Badge kind="warn">vence {fmtDate(e.dueDate)}</Badge>}
                    <Badge>{e.type === 'fixo' ? 'Fixo' : 'Flexível'}</Badge>
                    {e.detax && <Badge kind="info">Detax</Badge>}
                    {e.note && <span className="small muted" title={e.note}>📝</span>}
                  </span>
                </div>
                <div className="expense-value">
                  <strong>{fmtMoney(expenseTotal(e), e.currency)}</strong>
                  {Number(e.qty) !== 1 && <span className="small muted">{e.qty} × {fmtMoney(e.unitPrice, e.currency)}</span>}
                  {e.currency !== 'BRL' && <span className="small muted">≈ {fmtBRL(toBRL(e, trip, rate))}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {editing && <ExpenseForm trip={trip} expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

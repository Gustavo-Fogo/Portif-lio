import { useState } from 'react';
import { useStore, upsertItem, removeItem } from '../lib/store.jsx';
import { newExpense, PAYMENT_METHODS, STATUS, MOMENTS, TYPES, isCardPayment } from '../lib/model.js';
import { expenseTotal, toBRL, effectiveRate, cardMarkupPct } from '../lib/money.js';
import { fmtBRL, fmtMoney, fmtDayShort } from '../lib/format.js';
import { Modal, Field, NumberInput, Segmented, Chips, toast } from '../components/ui.jsx';

export default function ExpenseForm({ trip, expense, preset, onClose }) {
  const { updateTrip, rates } = useStore();
  const [e, setE] = useState(() => (expense ? structuredClone(expense) : newExpense(trip, preset)));
  const set = (patch) => setE((x) => ({ ...x, ...patch }));
  const rate = effectiveRate(trip, rates);
  const total = expenseTotal(e);
  const brl = toBRL(e, trip, rate);
  const currencies = [...new Set([trip.currency, 'BRL'])];
  const [err, setErr] = useState('');

  function setSplitMode(mode) {
    if (mode === 'individual') set({ split: { mode, people: [e.split.people[0] || e.paidBy] } });
    else set({ split: { mode, people: e.split.people.length > 1 ? e.split.people : trip.participants.map((p) => p.id) } });
  }

  function toggleSplitPerson(id) {
    const people = e.split.people.includes(id) ? e.split.people.filter((x) => x !== id) : [...e.split.people, id];
    set({ split: { ...e.split, people: trip.participants.map((p) => p.id).filter((pid) => people.includes(pid)) } });
  }

  async function save() {
    if (!e.description.trim()) return setErr('Informe a descrição.');
    if (e.split.mode === 'igual' && e.split.people.length < 1) return setErr('Selecione ao menos uma pessoa na divisão.');
    const out = { ...e, description: e.description.trim() };
    if (out.moment !== 'durante') out.day = '';
    if (out.status !== 'a_pagar') out.dueDate = '';
    if (out.status !== 'pago' || out.currency === 'BRL') out.paidBRL = null;
    await updateTrip(trip.id, (t) => {
      upsertItem(t, 'expenses', out);
      if (out.activityId) {
        const a = t.activities.find((x) => x.id === out.activityId);
        if (a) a.expenseId = out.id;
      }
    });
    toast(expense ? 'Gasto atualizado.' : 'Gasto adicionado.');
    onClose();
  }

  async function del() {
    if (!confirm('Excluir este gasto?')) return;
    await updateTrip(trip.id, (t) => {
      removeItem(t, 'expenses', e.id);
      for (const a of t.activities) if (a.expenseId === e.id) a.expenseId = null;
    });
    toast('Gasto excluído.');
    onClose();
  }

  return (
    <Modal
      title={expense ? 'Editar gasto' : 'Novo gasto'}
      onClose={onClose}
      footer={
        <>
          {expense && <button className="btn btn-danger" onClick={del}>Excluir</button>}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </>
      }
    >
      {err && <div className="alert alert-danger">{err}</div>}
      <Field label="Descrição *">
        <input value={e.description} onChange={(x) => set({ description: x.target.value })} placeholder="Ex.: Ingresso Torre Eiffel" autoFocus={!expense} />
      </Field>
      <div className="grid-2">
        <Field label="Local / fornecedor">
          <input value={e.vendor} onChange={(x) => set({ vendor: x.target.value })} placeholder="Ex.: Booking, Galeries Lafayette" />
        </Field>
        <Field label="Categoria">
          <select value={e.categoryId} onChange={(x) => set({ categoryId: x.target.value })}>
            {trip.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid-3">
        <Field label="Quantidade">
          <NumberInput value={e.qty} onChange={(v) => set({ qty: v })} />
        </Field>
        <Field label="Valor unitário">
          <NumberInput value={e.unitPrice} onChange={(v) => set({ unitPrice: v })} />
        </Field>
        <Field label="Moeda">
          <Segmented value={e.currency} onChange={(v) => set({ currency: v })} options={currencies.map((c) => [c, c])} />
        </Field>
      </div>
      <div className="total-line">
        Total: <strong>{fmtMoney(total, e.currency)}</strong>
        {e.currency !== 'BRL' && (
          <span className="muted">
            {' '}≈ {fmtBRL(brl)}
            {e.status === 'pago' && e.paidBRL ? ' (valor real pago)' : isCardPayment(e.paymentMethod) ? ` (cotação + ${cardMarkupPct(trip).toLocaleString('pt-BR')}% cartão)` : ' (cotação do dia)'}
          </span>
        )}
      </div>

      <Field label="Status">
        <Segmented value={e.status} onChange={(v) => set({ status: v, type: v === 'estimado' && !expense ? 'flexivel' : e.type })} options={Object.entries(STATUS)} />
      </Field>
      {e.status === 'a_pagar' && (
        <Field label="Data de vencimento">
          <input type="date" value={e.dueDate} onChange={(x) => set({ dueDate: x.target.value })} />
        </Field>
      )}
      {e.status === 'pago' && e.currency !== 'BRL' && (
        <Field label="Valor efetivamente pago em reais (opcional)" hint="Veja na fatura do cartão. Se preencher, este valor substitui a conversão pela cotação.">
          <NumberInput value={e.paidBRL} allowEmpty onChange={(v) => set({ paidBRL: v })} placeholder="R$" />
        </Field>
      )}

      <div className="grid-2">
        <Field label="Momento">
          <Segmented value={e.moment} onChange={(v) => set({ moment: v, day: v === 'durante' ? e.day || trip.days[0]?.date || '' : '' })} options={[['antes', 'Antes'], ['durante', 'Durante']]} />
        </Field>
        {e.moment === 'durante' ? (
          <Field label="Dia">
            <select value={e.day} onChange={(x) => set({ day: x.target.value })}>
              <option value="">—</option>
              {trip.days.map((d) => (
                <option key={d.date} value={d.date}>{fmtDayShort(d.date)}{d.theme ? ` – ${d.theme}` : ''}</option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <Field label="Tipo">
          <Segmented value={e.type} onChange={(v) => set({ type: v })} options={Object.entries(TYPES)} />
        </Field>
        <Field label="Forma de pagamento">
          <select value={e.paymentMethod} onChange={(x) => set({ paymentMethod: x.target.value })}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="fieldset">
        <legend>Quem pagou e divisão</legend>
        <Field label="Quem pagou">
          <select value={e.paidBy} onChange={(x) => set({ paidBy: x.target.value, split: e.split.mode === 'individual' && e.split.people[0] === e.paidBy ? { mode: 'individual', people: [x.target.value] } : e.split })}>
            {trip.participants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Divisão">
          <Segmented value={e.split.mode} onChange={setSplitMode} options={[['individual', 'Individual'], ['igual', 'Dividido igualmente']]} />
        </Field>
        {e.split.mode === 'individual' ? (
          <Field label="Gasto de">
            <select value={e.split.people[0] || ''} onChange={(x) => set({ split: { mode: 'individual', people: [x.target.value] } })}>
              {trip.participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={`Dividir entre (${e.split.people.length})`} hint={e.split.people.length ? `${fmtBRL(brl / e.split.people.length)} para cada` : ''}>
            <Chips options={trip.participants.map((p) => [p.id, p.name])} selected={e.split.people} onToggle={toggleSplitPerson} />
          </Field>
        )}
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={!!e.detax} onChange={(x) => set({ detax: x.target.checked })} />
        <span>Compra com Detax (permite restituição de imposto)</span>
      </label>

      <Field label="Observação">
        <textarea rows={2} value={e.note} onChange={(x) => set({ note: x.target.value })} />
      </Field>
    </Modal>
  );
}

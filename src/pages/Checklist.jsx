import { useState } from 'react';
import { useStore, upsertItem, removeItem } from '../lib/store.jsx';
import { uid, now, newRisk, RISK_TYPES, RISK_LEVELS } from '../lib/model.js';
import { fmtDate } from '../lib/format.js';
import { Card, Modal, Field, Badge } from '../components/ui.jsx';

const levelKind = { alto: 'danger', medio: 'warn', baixo: 'neutral' };

export default function Checklist({ trip }) {
  const { updateTrip } = useStore();
  const [text, setText] = useState('');
  const [group, setGroup] = useState('');
  const [risk, setRisk] = useState(null);
  const [hideDone, setHideDone] = useState(false);

  const groups = [...new Set(trip.checklist.map((c) => c.group || 'Geral'))];
  const done = trip.checklist.filter((c) => c.done).length;
  const pct = trip.checklist.length ? Math.round((done / trip.checklist.length) * 100) : 0;

  const toggle = (id) =>
    updateTrip(trip.id, (t) => {
      const c = t.checklist.find((x) => x.id === id);
      c.done = !c.done;
      c.updatedAt = now();
    });

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await updateTrip(trip.id, (t) => upsertItem(t, 'checklist', { id: uid(), text: text.trim(), group: group.trim() || 'Geral', done: false }));
    setText('');
  }

  const levels = { alto: 0, medio: 1, baixo: 2 };
  const risks = [...trip.risks].sort((a, b) => Number(a.done) - Number(b.done) || levels[a.level] - levels[b.level] || (a.date || '9').localeCompare(b.date || '9'));

  return (
    <div className="stack-gap">
      <Card title="Checklist de preparação" actions={<label className="check small"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> <span>Ocultar feitos</span></label>}>
        <div className="progress" aria-label={`${pct}% concluído`}>
          <div className="progress-bar" style={{ width: pct + '%' }} />
        </div>
        <p className="small muted">{done} de {trip.checklist.length} itens ({pct}%)</p>
        {groups.map((g) => {
          const items = trip.checklist.filter((c) => (c.group || 'Geral') === g && (!hideDone || !c.done));
          if (!items.length) return null;
          return (
            <div key={g} className="check-group">
              <h4>{g}</h4>
              <ul className="check-list">
                {items.map((c) => (
                  <li key={c.id} className={c.done ? 'done' : ''}>
                    <label className="check big">
                      <input type="checkbox" checked={c.done} onChange={() => toggle(c.id)} />
                      <span>{c.text}</span>
                    </label>
                    <button className="btn-icon" aria-label="Excluir item" onClick={() => confirm('Excluir item?') && updateTrip(trip.id, (t) => removeItem(t, 'checklist', c.id))}>🗑</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <form className="add-form" onSubmit={add}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Novo item…" aria-label="Novo item" />
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Grupo (opcional)" list="check-groups" aria-label="Grupo" />
          <datalist id="check-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <button className="btn btn-primary" type="submit">Adicionar</button>
        </form>
      </Card>

      <Card title="Riscos e alertas" actions={<button className="btn btn-small" onClick={() => setRisk(newRisk())}>+ Alerta</button>}>
        {risks.length ? (
          <ul className="risk-list">
            {risks.map((r) => (
              <li key={r.id} className={r.done ? 'done' : ''}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!r.done}
                    aria-label="Resolvido"
                    onChange={() => updateTrip(trip.id, (t) => { const x = t.risks.find((y) => y.id === r.id); x.done = !x.done; x.updatedAt = now(); })}
                  />
                </label>
                <button className="risk" onClick={() => setRisk(r)}>
                  <span className="badges">
                    <Badge kind={levelKind[r.level]}>{RISK_LEVELS[r.level]}</Badge>
                    <Badge>{r.type}</Badge>
                    {r.date && <Badge kind="info">{fmtDate(r.date)}</Badge>}
                  </span>
                  <span>{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Ex.: horários de fechamento, feriados, último metrô, greves.</p>
        )}
        <p className="small muted">Alertas com data aparecem também no dia correspondente do roteiro. Marque como resolvido quando tratar.</p>
      </Card>

      {risk && <RiskForm trip={trip} risk={risk} onClose={() => setRisk(null)} />}
    </div>
  );
}

function RiskForm({ trip, risk, onClose }) {
  const { updateTrip } = useStore();
  const [r, setR] = useState(() => structuredClone(risk));
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const exists = trip.risks.some((x) => x.id === risk.id);
  return (
    <Modal
      title={exists ? 'Editar alerta' : 'Novo alerta'}
      onClose={onClose}
      footer={
        <>
          {exists && <button className="btn btn-danger" onClick={async () => { if (confirm('Excluir alerta?')) { await updateTrip(trip.id, (t) => removeItem(t, 'risks', r.id)); onClose(); } }}>Excluir</button>}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!r.text.trim()} onClick={async () => { await updateTrip(trip.id, (t) => upsertItem(t, 'risks', { ...r, text: r.text.trim() })); onClose(); }}>Salvar</button>
        </>
      }
    >
      <Field label="Descrição">
        <textarea rows={3} value={r.text} onChange={(e) => set({ text: e.target.value })} autoFocus placeholder="Ex.: Louvre fecha às terças" />
      </Field>
      <div className="grid-3">
        <Field label="Tipo">
          <select value={r.type} onChange={(e) => set({ type: e.target.value })}>{RISK_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Gravidade">
          <select value={r.level} onChange={(e) => set({ level: e.target.value })}>{Object.entries(RISK_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Dia (opcional)">
          <select value={r.date} onChange={(e) => set({ date: e.target.value })}>
            <option value="">—</option>
            {trip.days.map((d) => <option key={d.date} value={d.date}>{fmtDate(d.date)}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

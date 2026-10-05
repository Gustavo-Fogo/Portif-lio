import { useState } from 'react';
import { useStore, upsertItem, removeItem, go } from '../lib/store.jsx';
import { activitiesOfDay, dayColor, newExpense, newTransport, FIXED_TRANSPORT_TYPES } from '../lib/model.js';
import { fmtDayLong, fmtMoney, fmtDate } from '../lib/format.js';
import { googleMapsDirUrl, hasCoords } from '../lib/geo.js';
import { Card, Modal, Field, toast } from '../components/ui.jsx';
import ActivityForm from './ActivityForm.jsx';

const MODE_ICON = { 'a pé': '🚶', metrô: '🚇', rer: '🚆', trem: '🚆', ônibus: '🚌', tram: '🚊', 'táxi/uber': '🚕', carro: '🚗', bicicleta: '🚲', barco: '⛴️', avião: '✈️' };
export const modeIcon = (m) => MODE_ICON[String(m || '').toLowerCase()] || '➜';

export default function Itinerary({ trip }) {
  const { updateTrip } = useStore();
  const [editing, setEditing] = useState(null); // {activity?, date}
  const [editingTransport, setEditingTransport] = useState(null);
  const [drag, setDrag] = useState(null);

  async function move(a, dir) {
    await updateTrip(trip.id, (t) => {
      const list = activitiesOfDay(t, a.date);
      const i = list.findIndex((x) => x.id === a.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((x, k) => {
        x.order = k + 1;
        x.updatedAt = Date.now();
      });
    });
  }

  async function dropOn(target) {
    if (!drag || drag.id === target.id) return;
    await updateTrip(trip.id, (t) => {
      const moving = t.activities.find((x) => x.id === drag.id);
      if (!moving) return;
      moving.date = target.date;
      const list = activitiesOfDay(t, target.date).filter((x) => x.id !== moving.id);
      const idx = list.findIndex((x) => x.id === target.id);
      list.splice(idx, 0, moving);
      list.forEach((x, k) => {
        x.order = k + 1;
        x.updatedAt = Date.now();
      });
    });
    setDrag(null);
  }

  async function costToExpense(a) {
    const exp = newExpense(trip, {
      description: a.title,
      vendor: a.title,
      categoryId: trip.categories.some((c) => c.id === 'passeios') ? 'passeios' : trip.categories[0]?.id,
      qty: 1,
      unitPrice: Number(a.cost) || 0,
      currency: a.costCurrency || trip.currency,
      moment: 'durante',
      day: a.date,
      type: 'flexivel',
      status: 'estimado',
      source: 'roteiro',
      activityId: a.id,
      note: 'Lançado a partir do roteiro.',
    });
    await updateTrip(trip.id, (t) => {
      upsertItem(t, 'expenses', exp);
      const act = t.activities.find((x) => x.id === a.id);
      if (act) act.expenseId = exp.id;
    });
    toast('Custo lançado no Financeiro como estimado.');
  }

  const setTheme = (date, theme) =>
    updateTrip(trip.id, (t) => {
      const d = t.days.find((x) => x.date === date);
      if (d) {
        d.theme = theme;
        d.updatedAt = Date.now();
      }
    });

  return (
    <div className="stack-gap">
      <Card
        title="Transporte fixo"
        actions={<button className="btn btn-small" onClick={() => setEditingTransport(newTransport({ date: trip.startDate }))}>+ Adicionar</button>}
      >
        {trip.transports.length ? (
          <ul className="transport-list">
            {[...trip.transports].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((x) => (
              <li key={x.id}>
                <button className="transport" onClick={() => setEditingTransport(x)}>
                  <span className="badge">{x.type}</span>
                  <span>
                    <strong>{[x.from, x.to].filter(Boolean).join(' → ') || x.description}</strong>
                    <span className="small muted block">
                      {[x.date && fmtDate(x.date), x.time && `${x.time}${x.arrival ? `–${x.arrival}` : ''}`, x.code, x.from || x.to ? x.description : ''].filter(Boolean).join(' · ')}
                    </span>
                    {x.note && <span className="small block">{x.note}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Voos, trens, transfers e passes de transporte com horário marcado.</p>
        )}
      </Card>

      {!trip.days.length && <div className="empty">Defina as datas da viagem para gerar os dias do roteiro.</div>}

      {trip.days.map((d, di) => {
        const acts = activitiesOfDay(trip, d.date);
        const color = dayColor(trip, d.date);
        const points = [trip.lodging, ...acts].filter((p) => hasCoords(p) || p.address);
        return (
          <section key={d.date} className="day" style={{ borderTopColor: color }}>
            <div className="day-head">
              <div>
                <div className="day-label" style={{ color }}>Dia {di + 1}</div>
                <h3 className="day-title">{fmtDayLong(d.date)}</h3>
              </div>
              {acts.length > 0 && (
                <div className="btn-row">
                  <a className="btn btn-small" href={`#/v/${trip.id}/mapa?dia=${d.date}`}>🗺️ Mapa</a>
                  {points.length > 1 && (
                    <a className="btn btn-small" target="_blank" rel="noreferrer" href={googleMapsDirUrl(points, 'walking')}>Google Maps</a>
                  )}
                </div>
              )}
            </div>
            <DayTheme value={d.theme} onSave={(v) => setTheme(d.date, v)} />
            {trip.risks.filter((r) => r.date === d.date && !r.done).map((r) => (
              <div key={r.id} className="alert alert-warn small">⚠️ {r.text}</div>
            ))}

            <ol className="acts">
              {acts.map((a, i) => (
                <li
                  key={a.id}
                  className={'act-item' + (drag?.id === a.id ? ' dragging' : '')}
                  draggable
                  onDragStart={() => setDrag(a)}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(a)}
                >
                  <Transfer t={a.transfer} first={i === 0} onClick={() => setEditing({ activity: a })} />
                  <div className="act">
                    <div className="act-num" style={{ background: color }}>{i + 1}</div>
                    <div className="act-body" onClick={() => setEditing({ activity: a })}>
                      <div className="act-title">
                        {a.time && <span className="act-time">{a.time}</span>}
                        <strong>{a.title}</strong>
                        {!hasCoords(a) && a.address && <span className="small muted" title="Sem coordenadas"> · sem pino</span>}
                      </div>
                      {a.address && <div className="small muted">{a.address}</div>}
                      {a.note && <div className="small">{a.note}</div>}
                      {a.alert && <div className="act-alert">⚠️ {a.alert}</div>}
                    </div>
                    <div className="act-side">
                      <div className="arrows">
                        <button className="btn-icon" aria-label="Mover para cima" disabled={i === 0} onClick={() => move(a, -1)}>▲</button>
                        <button className="btn-icon" aria-label="Mover para baixo" disabled={i === acts.length - 1} onClick={() => move(a, 1)}>▼</button>
                      </div>
                    </div>
                  </div>
                  {a.cost > 0 && (
                    <div className="act-cost">
                      <span>Custo estimado: <strong>{fmtMoney(a.cost, a.costCurrency)}</strong></span>
                      {a.expenseId && trip.expenses.some((e) => e.id === a.expenseId) ? (
                        <button className="link" onClick={() => go(`/v/${trip.id}/financeiro`)}>✓ no Financeiro</button>
                      ) : (
                        <button className="btn btn-small" onClick={() => costToExpense(a)}>Lançar no Financeiro</button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button className="btn btn-block btn-dashed" onClick={() => setEditing({ date: d.date })}>+ Atividade</button>
          </section>
        );
      })}

      {editing && <ActivityForm trip={trip} activity={editing.activity} date={editing.date} onClose={() => setEditing(null)} />}
      {editingTransport && <TransportForm trip={trip} item={editingTransport} onClose={() => setEditingTransport(null)} />}
    </div>
  );
}

function Transfer({ t, first, onClick }) {
  if (!t || !(t.duration || t.mode || t.line || t.note)) return null;
  return (
    <button className="transfer" onClick={onClick}>
      <span aria-hidden="true">{modeIcon(t.mode)}</span>
      <span>
        {first && <span className="muted">Saída: </span>}
        {[t.mode, t.line && `linha ${t.line}`, t.duration].filter(Boolean).join(' · ')}
        {t.note && <span className="muted"> — {t.note}</span>}
      </span>
    </button>
  );
}

function DayTheme({ value, onSave }) {
  const [v, setV] = useState(value || '');
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button className="day-theme" onClick={() => { setV(value || ''); setEditing(true); }}>
        {value ? <span>🎯 {value}</span> : <span className="muted">+ Tema do dia</span>}
      </button>
    );
  return (
    <form
      className="row-input"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v.trim());
        setEditing(false);
      }}
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Ex.: Montmartre e Sacré-Cœur" onBlur={() => { onSave(v.trim()); setEditing(false); }} />
    </form>
  );
}

function TransportForm({ trip, item, onClose }) {
  const { updateTrip } = useStore();
  const [x, setX] = useState(() => structuredClone(item));
  const set = (patch) => setX((y) => ({ ...y, ...patch }));
  const exists = trip.transports.some((t) => t.id === item.id);
  return (
    <Modal
      title={exists ? 'Editar transporte' : 'Novo transporte fixo'}
      onClose={onClose}
      footer={
        <>
          {exists && (
            <button className="btn btn-danger" onClick={async () => { if (confirm('Excluir?')) { await updateTrip(trip.id, (t) => removeItem(t, 'transports', x.id)); onClose(); } }}>
              Excluir
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={async () => { await updateTrip(trip.id, (t) => upsertItem(t, 'transports', x)); onClose(); }}>Salvar</button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Tipo">
          <select value={x.type} onChange={(e) => set({ type: e.target.value })}>
            {FIXED_TRANSPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Código / nº do voo / reserva">
          <input value={x.code} onChange={(e) => set({ code: e.target.value })} />
        </Field>
        <Field label="De">
          <input value={x.from} onChange={(e) => set({ from: e.target.value })} placeholder="GRU" />
        </Field>
        <Field label="Para">
          <input value={x.to} onChange={(e) => set({ to: e.target.value })} placeholder="CDG" />
        </Field>
        <Field label="Data">
          <input type="date" value={x.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <div className="grid-2 tight">
          <Field label="Saída">
            <input type="time" value={x.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          <Field label="Chegada">
            <input type="time" value={x.arrival} onChange={(e) => set({ arrival: e.target.value })} />
          </Field>
        </div>
      </div>
      <Field label="Descrição">
        <input value={x.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Air France AF457" />
      </Field>
      <Field label="Observação">
        <textarea rows={2} value={x.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <p className="small muted">Para somar o custo nos totais, lance o valor também no Financeiro (categoria Transporte).</p>
    </Modal>
  );
}

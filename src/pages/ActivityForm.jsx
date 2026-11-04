import { useState } from 'react';
import { useStore, upsertItem, removeItem } from '../lib/store.jsx';
import { newActivity, TRANSPORT_MODES, activitiesOfDay } from '../lib/model.js';
import { fmtDayShort } from '../lib/format.js';
import { Modal, Field, NumberInput, Segmented, toast } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { STEP_KINDS, isTransit, newStep, routeMinutes, fmtMinutes } from '../lib/transit.js';
import { RouteSteps } from '../components/Route.jsx';

export default function ActivityForm({ trip, activity, date, onClose }) {
  const { updateTrip } = useStore();
  const [a, setA] = useState(() => (activity ? structuredClone(activity) : newActivity({ date: date || trip.days[0]?.date || '', costCurrency: trip.currency })));
  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const setTr = (patch) => setA((x) => ({ ...x, transfer: { ...x.transfer, ...patch } }));
  const steps = a.transfer.steps || [];
  const setSteps = (list) => setTr({ steps: list });
  const setStep = (i, patch) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const moveStep = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const l = [...steps];
    [l[i], l[j]] = [l[j], l[i]];
    setSteps(l);
  };
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState('');
  const isFirst = activity ? activitiesOfDay(trip, a.date)[0]?.id === a.id : !activitiesOfDay(trip, a.date).length;

  async function save() {
    if (!a.title.trim()) return setErr('Informe o local ou nome da atividade.');
    const out = { ...a, title: a.title.trim() };
    await updateTrip(trip.id, (t) => {
      if (!activity || activity.date !== out.date) out.order = Math.max(0, ...t.activities.filter((x) => x.date === out.date).map((x) => x.order || 0)) + 1;
      upsertItem(t, 'activities', out);
    });
    toast(activity ? 'Atividade salva.' : 'Atividade adicionada.');
    onClose();
  }

  async function del() {
    if (!confirm('Excluir esta atividade?' + (a.expenseId ? ' O gasto lançado no Financeiro será mantido.' : ''))) return;
    await updateTrip(trip.id, (t) => removeItem(t, 'activities', a.id));
    onClose();
  }

  return (
    <Modal
      title={activity ? 'Editar atividade' : 'Nova atividade'}
      onClose={onClose}
      footer={
        <>
          {activity && <button className="btn btn-danger" onClick={del}>Excluir</button>}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </>
      }
    >
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="grid-2">
        <Field label="Dia">
          <select value={a.date} onChange={(e) => set({ date: e.target.value })}>
            {trip.days.map((d) => (
              <option key={d.date} value={d.date}>{fmtDayShort(d.date)}{d.theme ? ` – ${d.theme}` : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Horário">
          <input type="time" value={a.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
      </div>
      <Field label="Local / atividade *">
        <input value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Museu d'Orsay" autoFocus={!activity} />
      </Field>
      <Field label="Endereço" group>
        <LocationPicker
          address={a.address}
          lat={a.lat}
          lng={a.lng}
          near={trip.lodging}
          placeholder={a.title ? `${a.title}, ${trip.destination || ''}` : 'Endereço ou nome do lugar'}
          onChange={(loc) => set(loc)}
        />
      </Field>
      <Field label="Observação">
        <textarea rows={2} value={a.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <Field label="⚠️ Alerta" hint="Ex.: fecha às 18h, comprar ingresso antes, último trem 0h30.">
        <input value={a.alert} onChange={(e) => set({ alert: e.target.value })} />
      </Field>
      <div className="grid-2">
        <Field label="Custo estimado (total do grupo, opcional)">
          <NumberInput value={a.cost} allowEmpty onChange={(v) => set({ cost: v })} />
        </Field>
        <Field label="Moeda">
          <Segmented value={a.costCurrency} onChange={(v) => set({ costCurrency: v })} options={[...new Set([trip.currency, 'BRL'])].map((c) => [c, c])} />
        </Field>
      </div>

      <fieldset className="fieldset">
        <legend>Como chegar aqui {isFirst ? '(da hospedagem ou do ponto anterior)' : '(desde a atividade anterior)'}</legend>
        {steps.length > 0 && (
          <div className="btn-row">
            <span className="small muted">Total: <strong>{fmtMinutes(routeMinutes(a.transfer)) || '—'}</strong></span>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setPreview(!preview)}>{preview ? 'Editar etapas' : 'Ver como fica'}</button>
          </div>
        )}
        {preview ? (
          <RouteSteps transfer={a.transfer} />
        ) : (
          <ol className="step-editor">
            {steps.map((st, i) => (
              <li key={i} className="step-edit">
                <div className="step-edit-head">
                  <strong>Etapa {i + 1}</strong>
                  <span>
                    <button type="button" className="btn-icon" aria-label="Subir etapa" disabled={i === 0} onClick={() => moveStep(i, -1)}>▲</button>
                    <button type="button" className="btn-icon" aria-label="Descer etapa" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>▼</button>
                    <button type="button" className="btn-icon" aria-label="Remover etapa" onClick={() => setSteps(steps.filter((_, k) => k !== i))}>🗑</button>
                  </span>
                </div>
                <div className="grid-3">
                  <Field label="Tipo">
                    <select value={st.kind} onChange={(e) => setStep(i, { kind: e.target.value })}>
                      {STEP_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                    </select>
                  </Field>
                  {isTransit(st.kind) && (
                    <Field label="Linha">
                      <input value={st.line} onChange={(e) => setStep(i, { line: e.target.value })} placeholder={st.kind === 'rer' ? 'B' : '6'} />
                    </Field>
                  )}
                  <Field label="Minutos">
                    <input inputMode="numeric" value={st.min} onChange={(e) => setStep(i, { min: e.target.value })} placeholder="10" />
                  </Field>
                </div>
                {isTransit(st.kind) ? (
                  <>
                    <div className="grid-2">
                      <Field label="Embarque em">
                        <input value={st.from} onChange={(e) => setStep(i, { from: e.target.value })} placeholder="Estação de embarque" />
                      </Field>
                      <Field label="Desça em">
                        <input value={st.to} onChange={(e) => setStep(i, { to: e.target.value })} placeholder="Estação de desembarque" />
                      </Field>
                      <Field label="Sentido (placa do trem)">
                        <input value={st.direction} onChange={(e) => setStep(i, { direction: e.target.value })} placeholder="Ex.: Nation" />
                      </Field>
                      <Field label="Paradas">
                        <input inputMode="numeric" value={st.stops} onChange={(e) => setStep(i, { stops: e.target.value })} placeholder="3" />
                      </Field>
                    </div>
                  </>
                ) : (
                  <Field label="Até onde">
                    <input value={st.to} onChange={(e) => setStep(i, { to: e.target.value })} placeholder="Ex.: estação Trocadéro" />
                  </Field>
                )}
                <Field label="Dica (opcional)">
                  <input value={st.note} onChange={(e) => setStep(i, { note: e.target.value })} placeholder="Ex.: saída 1, vagão da frente" />
                </Field>
              </li>
            ))}
          </ol>
        )}
        {!preview && (
          <div className="btn-row">
            <button type="button" className="btn btn-small" onClick={() => setSteps([...steps, newStep({ kind: 'walk' })])}>+ A pé</button>
            <button type="button" className="btn btn-small" onClick={() => setSteps([...steps, newStep({ kind: 'metro', from: steps[steps.length - 1]?.to || '' })])}>+ Metrô</button>
            <button type="button" className="btn btn-small" onClick={() => setSteps([...steps, newStep({ kind: 'rer', from: steps[steps.length - 1]?.to || '' })])}>+ RER</button>
            <button type="button" className="btn btn-small" onClick={() => setSteps([...steps, newStep({ kind: 'bus', from: steps[steps.length - 1]?.to || '' })])}>+ Ônibus</button>
            <button type="button" className="btn btn-small" onClick={() => setSteps([...steps, newStep({ kind: 'uber' })])}>+ Uber</button>
          </div>
        )}
        <Field label="Observação do trajeto">
          <input value={a.transfer.note} onChange={(e) => setTr({ note: e.target.value })} placeholder="Ex.: saiam até 23h30; com malas, prefiram Uber" />
        </Field>
        {!steps.length && (
          <div className="grid-3">
            <Field label="Tempo">
              <input value={a.transfer.duration} onChange={(e) => setTr({ duration: e.target.value })} placeholder="20 min" />
            </Field>
            <Field label="Meio">
              <input list="modes" value={a.transfer.mode} onChange={(e) => setTr({ mode: e.target.value })} placeholder="Metrô" />
              <datalist id="modes">
                {TRANSPORT_MODES.map((m) => <option key={m} value={m} />)}
              </datalist>
            </Field>
            <Field label="Linha">
              <input value={a.transfer.line} onChange={(e) => setTr({ line: e.target.value })} placeholder="M1, RER B…" />
            </Field>
          </div>
        )}
      </fieldset>
    </Modal>
  );
}

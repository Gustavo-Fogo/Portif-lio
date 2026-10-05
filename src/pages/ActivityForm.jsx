import { useState } from 'react';
import { useStore, upsertItem, removeItem } from '../lib/store.jsx';
import { newActivity, TRANSPORT_MODES, activitiesOfDay } from '../lib/model.js';
import { fmtDayShort } from '../lib/format.js';
import { Modal, Field, NumberInput, Segmented, toast } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

export default function ActivityForm({ trip, activity, date, onClose }) {
  const { updateTrip } = useStore();
  const [a, setA] = useState(() => (activity ? structuredClone(activity) : newActivity({ date: date || trip.days[0]?.date || '', costCurrency: trip.currency })));
  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const setTr = (patch) => setA((x) => ({ ...x, transfer: { ...x.transfer, ...patch } }));
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
        <legend>Deslocamento até aqui {isFirst ? '(da hospedagem ou do ponto anterior)' : '(desde a atividade anterior)'}</legend>
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
        <Field label="Detalhes do trajeto">
          <input value={a.transfer.note} onChange={(e) => setTr({ note: e.target.value })} placeholder="Descer na estação…, sentido…" />
        </Field>
      </fieldset>
    </Modal>
  );
}

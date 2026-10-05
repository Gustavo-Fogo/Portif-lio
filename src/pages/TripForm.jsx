import { useState } from 'react';
import { useStore, go } from '../lib/store.jsx';
import { newTrip, uid, now, CURRENCIES, PALETTE, DEFAULT_CATEGORIES } from '../lib/model.js';
import { Field, NumberInput, toast } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

export default function TripForm({ trip }) {
  const { saveTrip, removeTrip } = useStore();
  const editing = !!trip;
  const [t, setT] = useState(() => (trip ? structuredClone(trip) : newTrip({ name: '', participants: ['Eu'] })));
  const [errors, setErrors] = useState({});
  const set = (patch) => setT((x) => ({ ...x, ...patch }));

  const used = (pid) => t.expenses.some((e) => e.paidBy === pid || (e.split?.people || []).includes(pid));
  const usedCat = (cid) => t.expenses.some((e) => e.categoryId === cid);

  function validate() {
    const e = {};
    if (!t.name.trim()) e.name = 'Informe o nome da viagem.';
    if (!t.startDate) e.startDate = 'Informe a data de início.';
    if (!t.endDate) e.endDate = 'Informe a data de fim.';
    if (t.startDate && t.endDate && t.endDate < t.startDate) e.endDate = 'O fim deve ser depois do início.';
    if (!t.participants.some((p) => p.name.trim())) e.participants = 'Adicione ao menos um participante.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    const out = { ...t, participants: t.participants.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() })) };
    await saveTrip(out);
    toast(editing ? 'Viagem salva.' : 'Viagem criada!');
    go(`/v/${out.id}/resumo`);
  }

  async function del() {
    if (!confirm(`Excluir a viagem "${trip.name}" e todos os seus dados? Esta ação não pode ser desfeita (exporte um backup antes, se quiser).`)) return;
    await removeTrip(trip.id);
    toast('Viagem excluída.');
    go('/');
  }

  const setPart = (id, patch) => set({ participants: t.participants.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) });
  const setCat = (id, patch) => set({ categories: t.categories.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)) });

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="btn btn-ghost" onClick={() => go(editing ? `/v/${trip.id}/resumo` : '/')}>← Voltar</button>
          <h1 className="topbar-title">{editing ? 'Editar viagem' : 'Nova viagem'}</h1>
        </div>
      </header>
      <form className="container form" onSubmit={submit} noValidate>
        <section className="card">
          <h3>Dados da viagem</h3>
          <Field label="Nome da viagem *" hint={errors.name}>
            <input value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Paris 2026" autoFocus={!editing} />
          </Field>
          <div className="grid-2">
            <Field label="Destino (cidade)">
              <input value={t.destination} onChange={(e) => set({ destination: e.target.value })} placeholder="Paris" />
            </Field>
            <Field label="País">
              <input value={t.country} onChange={(e) => set({ country: e.target.value })} placeholder="França" />
            </Field>
            <Field label="Início *" hint={errors.startDate}>
              <input type="date" value={t.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: t.endDate && t.endDate >= e.target.value ? t.endDate : e.target.value })} />
            </Field>
            <Field label="Fim *" hint={errors.endDate}>
              <input type="date" value={t.endDate} min={t.startDate} onChange={(e) => set({ endDate: e.target.value })} />
            </Field>
            <Field label="Moeda local">
              <select value={t.currency} onChange={(e) => set({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} – {c.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="card">
          <h3>Hospedagem</h3>
          <Field label="Nome">
            <input value={t.lodging.name} onChange={(e) => set({ lodging: { ...t.lodging, name: e.target.value } })} placeholder="Hotel, Airbnb…" />
          </Field>
          <Field label="Endereço" group>
            <LocationPicker
              address={t.lodging.address}
              lat={t.lodging.lat}
              lng={t.lodging.lng}
              onChange={(loc) => set({ lodging: { ...t.lodging, ...loc } })}
            />
          </Field>
        </section>

        <section className="card">
          <h3>Participantes</h3>
          {errors.participants && <p className="text-danger small">{errors.participants}</p>}
          <ul className="edit-list">
            {t.participants.map((p, i) => (
              <li key={p.id}>
                <input value={p.name} aria-label={`Participante ${i + 1}`} placeholder={`Pessoa ${i + 1}`} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="Remover participante"
                  disabled={t.participants.length <= 1}
                  onClick={() => {
                    if (used(p.id)) return alert(`${p.name} aparece em gastos (pagou ou divide). Troque essas pessoas nos gastos antes de remover.`);
                    set({ participants: t.participants.filter((x) => x.id !== p.id), deleted: { ...t.deleted, [p.id]: now() } });
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => set({ participants: [...t.participants, { id: uid(), name: '', updatedAt: now() }] })}>
            + Adicionar pessoa
          </button>
        </section>

        {editing && (
          <>
            <section className="card">
              <h3>Categorias de gasto</h3>
              <ul className="edit-list">
                {t.categories.map((c) => (
                  <li key={c.id}>
                    <input type="color" value={c.color} aria-label="Cor" onChange={(e) => setCat(c.id, { color: e.target.value })} className="color-input" />
                    <input value={c.name} aria-label="Nome da categoria" onChange={(e) => setCat(c.id, { name: e.target.value })} />
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label="Remover categoria"
                      onClick={() => {
                        if (usedCat(c.id)) return alert('Há gastos nesta categoria. Mude-os de categoria antes de remover.');
                        set({ categories: t.categories.filter((x) => x.id !== c.id), deleted: { ...t.deleted, [c.id]: now() } });
                      }}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => set({ categories: [...t.categories, { id: 'cat-' + uid().slice(0, 8), name: 'Nova categoria', color: PALETTE[t.categories.length % PALETTE.length], updatedAt: now() }] })}>
                  + Categoria
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    const missing = DEFAULT_CATEGORIES.filter((d) => !t.categories.some((c) => c.id === d.id));
                    set({ categories: [...t.categories, ...missing.map((m) => ({ ...m, updatedAt: now() }))] });
                  }}
                >
                  Restaurar padrões
                </button>
              </div>
            </section>

            <section className="card">
              <h3>Detax (restituição de imposto)</h3>
              <div className="grid-2">
                <Field label="Restituição estimada (%)" hint="Na França, em geral 10–12% do valor da compra.">
                  <NumberInput value={t.detax.ratePct} onChange={(v) => set({ detax: { ...t.detax, ratePct: v } })} />
                </Field>
                <Field label={`Compra mínima por loja/dia (${t.currency})`} hint="França: €100,01.">
                  <NumberInput value={t.detax.minAmount} onChange={(v) => set({ detax: { ...t.detax, minAmount: v } })} />
                </Field>
              </div>
            </section>
          </>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg">{editing ? 'Salvar' : 'Criar viagem'}</button>
          {editing && (
            <button type="button" className="btn btn-danger" onClick={del}>
              Excluir viagem
            </button>
          )}
        </div>
      </form>
    </>
  );
}

import { useStore, go } from '../lib/store.jsx';
import { fmtDate, MONTHS, parseISODate, daysBetween, todayISO, fmtBRL } from '../lib/format.js';
import { summarize } from '../lib/money.js';

export default function Home() {
  const { trips, rates } = useStore();
  const sorted = [...trips].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  const groups = new Map();
  for (const t of sorted) {
    const d = parseISODate(t.startDate);
    const year = d ? String(d.getFullYear()) : 'Sem data';
    const month = d ? MONTHS[d.getMonth()] : '';
    if (!groups.has(year)) groups.set(year, new Map());
    const g = groups.get(year);
    if (!g.has(month)) g.set(month, []);
    g.get(month).push(t);
  }
  const today = todayISO();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="brand">✈️ Minhas viagens</h1>
          <button className="btn btn-ghost" onClick={() => go('/dados')}>Backup e dados</button>
        </div>
      </header>
      <main className="container">
        <button className="btn btn-primary btn-block btn-lg" onClick={() => go('/nova')}>
          + Nova viagem
        </button>
        {!trips.length && <p className="empty">Nenhuma viagem ainda. Crie a primeira!</p>}
        {[...groups.entries()].map(([year, months]) => (
          <section key={year} className="year-group">
            <h2 className="year">{year}</h2>
            {[...months.entries()].map(([month, list]) => (
              <div key={month}>
                {month && <h3 className="month">{month}</h3>}
                <div className="trip-list">
                  {list.map((t) => {
                    const until = daysBetween(today, t.startDate);
                    const after = daysBetween(t.endDate, today);
                    const s = summarize(t, rates);
                    return (
                      <button key={t.id} className="trip-card" onClick={() => go(`/v/${t.id}/resumo`)}>
                        <div className="trip-card-main">
                          <strong className="trip-name">{t.name || 'Sem nome'}</strong>
                          <span className="muted">
                            {[t.destination, t.country].filter(Boolean).join(', ')}
                          </span>
                          <span className="small">
                            {fmtDate(t.startDate)} – {fmtDate(t.endDate)} · {t.participants.length} {t.participants.length === 1 ? 'pessoa' : 'pessoas'}
                          </span>
                        </div>
                        <div className="trip-card-side">
                          {until > 0 && <span className="badge badge-info">faltam {until} dias</span>}
                          {until <= 0 && after <= 0 && <span className="badge badge-ok">em andamento</span>}
                          {after > 0 && <span className="badge">concluída</span>}
                          {s.byStatus.total > 0 && <span className="small muted">{fmtBRL(s.byStatus.total)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}

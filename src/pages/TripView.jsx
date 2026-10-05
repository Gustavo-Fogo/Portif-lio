import { lazy, Suspense, useEffect } from 'react';
import { useStore, go } from '../lib/store.jsx';
import { fmtDate } from '../lib/format.js';
import Summary from './Summary.jsx';
import Finance from './Finance.jsx';
import Itinerary from './Itinerary.jsx';
import Checklist from './Checklist.jsx';

const MapView = lazy(() => import('./MapView.jsx'));

const TABS = [
  ['resumo', 'Resumo', '📊'],
  ['financeiro', 'Financeiro', '💶'],
  ['roteiro', 'Roteiro', '🗓️'],
  ['mapa', 'Mapa', '🗺️'],
  ['checklist', 'Checklist', '✅'],
];

export default function TripView({ trip, tab }) {
  const { rates, refreshRate } = useStore();

  // Atualiza a cotação automaticamente (se online e com mais de 3 h).
  useEffect(() => {
    if (trip.currency === 'BRL' || !navigator.onLine) return;
    const r = rates[trip.currency];
    if (!r || Date.now() - r.fetchedAt > 3 * 3600 * 1000) refreshRate(trip.currency).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.currency]);

  const props = { trip };
  return (
    <div className="trip-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="btn btn-ghost" onClick={() => go('/')} aria-label="Voltar para viagens">←</button>
          <div className="topbar-title">
            <strong>{trip.name}</strong>
            <span className="small muted">
              {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={() => go(`/v/${trip.id}/editar`)}>Editar</button>
        </div>
        <nav className="tabs" aria-label="Seções da viagem">
          {TABS.map(([id, label, icon]) => (
            <a key={id} href={`#/v/${trip.id}/${id}`} className={'tab' + (tab === id ? ' on' : '')} aria-current={tab === id ? 'page' : undefined}>
              <span className="tab-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className={'container' + (tab === 'mapa' ? ' container-wide' : '')}>
        {tab === 'resumo' && <Summary {...props} />}
        {tab === 'financeiro' && <Finance {...props} />}
        {tab === 'roteiro' && <Itinerary {...props} />}
        {tab === 'mapa' && (
          <Suspense fallback={<div className="loading">Carregando mapa…</div>}>
            <MapView {...props} />
          </Suspense>
        )}
        {tab === 'checklist' && <Checklist {...props} />}
      </main>
    </div>
  );
}

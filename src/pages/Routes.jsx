// Aba "Trajetos": todos os deslocamentos de cada dia, passo a passo
import { useState } from 'react';
import { activitiesOfDay, dayColor } from '../lib/model.js';
import { fmtDayShort, fmtDayLong, todayISO } from '../lib/format.js';
import { hasRoute, routeMinutes, fmtMinutes, departureTime, isTransit } from '../lib/transit.js';
import { googleMapsDirUrl, hasCoords } from '../lib/geo.js';
import { RouteSteps, RouteSummary, LineBadge } from '../components/Route.jsx';

export default function Routes({ trip }) {
  const today = todayISO();
  const initial = trip.days.some((d) => d.date === today) ? today : trip.days.find((d) => legsOf(trip, d.date).length)?.date || trip.days[0]?.date;
  const [day, setDay] = useState(initial);
  const [open, setOpen] = useState({});
  const legs = legsOf(trip, day);
  const color = dayColor(trip, day);
  const theme = trip.days.find((d) => d.date === day)?.theme;
  const lines = uniqueLines(legs);

  return (
    <div className="stack-gap">
      <div className="chips map-filter" role="group" aria-label="Escolher dia">
        {trip.days.map((d, i) => {
          const n = legsOf(trip, d.date).length;
          return (
            <button
              key={d.date}
              className={'chip' + (day === d.date ? ' on' : '')}
              onClick={() => setDay(d.date)}
              style={day === d.date ? { borderColor: dayColor(trip, d.date), boxShadow: `inset 4px 0 0 ${dayColor(trip, d.date)}` } : undefined}
            >
              <span className="dot" style={{ background: dayColor(trip, d.date) }} /> {fmtDayShort(d.date)}
              {d.date === today && <span className="badge badge-info">hoje</span>}
              {n === 0 && <span className="muted small"> –</span>}
            </button>
          );
        })}
      </div>

      <div className="routes-head" style={{ borderLeftColor: color }}>
        <h3>{fmtDayLong(day)}</h3>
        {theme && <p className="muted">{theme}</p>}
        {lines.length > 0 && (
          <p className="routes-lines">
            <span className="small muted">Linhas do dia:</span> {lines.map((l) => <LineBadge key={l.kind + l.line} kind={l.kind} line={l.line} size="sm" />)}
          </p>
        )}
      </div>

      {!legs.length && <div className="empty">Nenhum deslocamento cadastrado neste dia.</div>}

      <ol className="legs">
        {legs.map(({ a, prev }, i) => {
          const min = routeMinutes(a.transfer);
          const leave = departureTime(a.time, min);
          const steps = a.transfer.steps || [];
          const transit = steps.some((s) => isTransit(s.kind));
          const isOpen = open[a.id] ?? transit; // trechos só a pé começam fechados
          const gm = steps.some((s) => s.kind === 'plane') ? null : googleMapsDirUrl([prev, a].filter(Boolean), 'transit');
          return (
            <li key={a.id} className={'leg' + (transit ? '' : ' leg-walk')}>
              <button className="leg-head" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} aria-expanded={isOpen}>
                <span className="leg-n" style={{ background: color }}>{i + 1}</span>
                <span className="leg-title">
                  <span className="leg-from">{prev ? prev.title : steps[0]?.from || 'Hospedagem'}</span>
                  <span className="leg-arrow" aria-hidden="true">↓</span>
                  <strong className="leg-to">{a.title}</strong>
                </span>
                <span className="leg-time">
                  {leave && <span>Saia <strong>{leave}</strong></span>}
                  {a.time && <span className="muted">chegar {a.time}</span>}
                </span>
              </button>
              <div className="leg-summary">
                <RouteSummary transfer={a.transfer} />
              </div>
              {isOpen && (
                <div className="leg-body">
                  <RouteSteps transfer={a.transfer} />
                  {a.transfer.note && <p className="leg-note">💡 {a.transfer.note}</p>}
                  {!a.transfer.steps?.length && !a.transfer.note && <p className="muted small">Sem detalhes do trajeto.</p>}
                  {gm && (hasCoords(a) || a.address) && (
                    <a className="btn btn-small" target="_blank" rel="noreferrer" href={gm}>Ver no Google Maps</a>
                  )}
                </div>
              )}
              {min > 0 && <span className="leg-total">{fmtMinutes(min)}</span>}
            </li>
          );
        })}
      </ol>

      <details className="card legend-card">
        <summary><strong>Como ler</strong></summary>
        <ul className="small">
          <li><strong>Embarque:</strong> estação onde vocês entram.</li>
          <li><strong>Sentido:</strong> o nome escrito nas placas da plataforma e na frente do trem (é sempre a última estação da linha).</li>
          <li><strong>Desça em:</strong> onde sair; o número de paradas ajuda a não passar do ponto.</li>
          <li><LineBadge kind="metro" line="1" size="sm" /> metrô · <LineBadge kind="rer" line="B" size="sm" /> RER (trem rápido) · 🚶 a pé. Todos inclusos no Navigo Semana (seg 9 a dom 15).</li>
          <li><strong>Saia:</strong> horário sugerido para sair do ponto anterior, somando os tempos das etapas.</li>
        </ul>
      </details>
    </div>
  );
}

function legsOf(trip, date) {
  if (!date) return [];
  const acts = activitiesOfDay(trip, date);
  return acts.map((a, i) => ({ a, prev: acts[i - 1] || null })).filter(({ a }) => hasRoute(a.transfer));
}

function uniqueLines(legs) {
  const seen = new Map();
  for (const { a } of legs) for (const s of a.transfer.steps || []) if (isTransit(s.kind) && s.line) seen.set(s.kind + s.line, { kind: s.kind, line: s.line });
  return [...seen.values()];
}

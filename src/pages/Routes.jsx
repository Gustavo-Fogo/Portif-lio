// Aba "Trajetos": mapa do dia com os lugares numerados e o passo a passo de cada deslocamento
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { activitiesOfDay, dayColor } from '../lib/model.js';
import { fmtDayShort, fmtDayLong, todayISO } from '../lib/format.js';
import { hasRoute, routeMinutes, fmtMinutes, departureTime, isTransit } from '../lib/transit.js';
import { googleMapsDirUrl, hasCoords } from '../lib/geo.js';
import { RouteSteps, RouteSummary, LineBadge } from '../components/Route.jsx';
import { TILE_URL, TILE_ATTR, homeIcon } from '../components/LocationPicker.jsx';

/** Nome curto para o rótulo do mapa: "Jantar — Bouillon Passy" → "Bouillon Passy". */
export function shortLabel(title) {
  let [a, b] = String(title || '').split(' — ');
  let s = b && /^(Almoço|Jantar|Café|Mercado|Comprar)/i.test(a) ? b : a;
  s = s.replace(/\s*\(.*\)\s*$/, '');
  return s.length > 26 ? s.slice(0, 24) + '…' : s;
}

function numIcon(color, n, selected) {
  return L.divIcon({
    className: 'npin-wrap',
    html: `<div class="npin${selected ? ' sel' : ''}" style="background:${color}">${n}</div>`,
    iconSize: selected ? [40, 40] : [32, 32],
    iconAnchor: selected ? [20, 20] : [16, 16],
  });
}

/** Esconde rótulos que se sobrepõem (o selecionado e os primeiros da ordem têm prioridade). */
function declutter(container) {
  if (!container) return;
  const labels = [...container.querySelectorAll('.leaflet-tooltip.map-label')];
  labels.forEach((l) => l.classList.remove('label-hidden'));
  labels.sort((a, b) => Number(b.classList.contains('sel')) - Number(a.classList.contains('sel')) || Number(a.dataset.n) - Number(b.dataset.n));
  const kept = [];
  for (const l of labels) {
    const r = l.getBoundingClientRect();
    const hit = kept.some((k) => !(r.right < k.left + 2 || r.left > k.right - 2 || r.bottom < k.top + 1 || r.top > k.bottom - 1));
    if (hit) l.classList.add('label-hidden');
    else kept.push(r);
  }
}

/** Ponto anterior com coordenadas (ou a hospedagem). */
function previousPoint(trip, acts, idx) {
  for (let i = idx - 1; i >= 0; i--) if (hasCoords(acts[i])) return acts[i];
  return hasCoords(trip.lodging) ? trip.lodging : null;
}

function DayMap({ trip, day, acts, selectedId, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef('');
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false, tap: true }).setView([48.8566, 2.3322], 12);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    map.current.on('zoomend moveend', () => declutter(el.current));
    layer.current = L.layerGroup().addTo(map.current);
    const t = setTimeout(() => map.current?.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      map.current.remove();
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const color = dayColor(trip, day);
    const pts = acts.map((a, i) => ({ a, n: i + 1 })).filter((p) => hasCoords(p.a));
    const line = pts.map((p) => [Number(p.a.lat), Number(p.a.lng)]);
    if (line.length > 1) L.polyline(line, { color, weight: 4, opacity: selectedId ? 0.35 : 0.9, dashArray: '1 10', lineCap: 'round' }).addTo(g);
    if (hasCoords(trip.lodging)) L.marker([Number(trip.lodging.lat), Number(trip.lodging.lng)], { icon: homeIcon(), zIndexOffset: -100 }).addTo(g);

    let focus = null;
    if (selectedId) {
      const idx = acts.findIndex((a) => a.id === selectedId);
      const a = acts[idx];
      const prev = idx >= 0 ? previousPoint(trip, acts, idx) : null;
      if (a && hasCoords(a)) {
        focus = [[Number(a.lat), Number(a.lng)]];
        if (prev) {
          const seg = [[Number(prev.lat), Number(prev.lng)], [Number(a.lat), Number(a.lng)]];
          L.polyline(seg, { color, weight: 6, opacity: 1, lineCap: 'round' }).addTo(g);
          focus = seg;
        }
      }
    }

    for (const p of pts) {
      const sel = p.a.id === selectedId;
      const m = L.marker([Number(p.a.lat), Number(p.a.lng)], { icon: numIcon(color, p.n, sel), zIndexOffset: sel ? 1000 : 0, keyboard: true, title: p.a.title }).addTo(g);
      m.bindTooltip(shortLabel(p.a.title), { permanent: true, direction: 'bottom', offset: [0, sel ? 18 : 14], className: 'map-label' + (sel ? ' sel' : '') });
      const tipEl = m.getTooltip()?.getElement();
      if (tipEl) tipEl.dataset.n = String(p.n);
      m.on('click', () => selectRef.current(p.a.id));
    }

    if (fitted.current !== day) {
      fitted.current = day;
      // Enquadra depois do layout: o mapa precisa saber o próprio tamanho.
      const fit = () => {
        if (!map.current) return;
        map.current.invalidateSize(false);
        if (line.length > 1) map.current.fitBounds(line, { padding: [40, 40], maxZoom: 16, animate: false });
        else if (line.length === 1) map.current.setView(line[0], 15, { animate: false });
      };
      requestAnimationFrame(() => requestAnimationFrame(() => { fit(); declutter(el.current); }));
    } else if (focus) {
      if (focus.length > 1) map.current.flyToBounds(focus, { padding: [60, 60], maxZoom: 16, duration: 0.6 });
      else map.current.flyTo(focus[0], Math.max(map.current.getZoom(), 15), { duration: 0.6 });
    }
    requestAnimationFrame(() => declutter(el.current));
  }, [trip, day, acts, selectedId]);

  return <div ref={el} className="route-map" role="application" aria-label="Mapa do dia com os lugares numerados" />;
}

export default function Routes({ trip }) {
  const today = todayISO();
  const initial = trip.days.some((d) => d.date === today) ? today : trip.days.find((d) => legsOf(trip, d.date).length)?.date || trip.days[0]?.date;
  const [day, setDay] = useState(initial);
  const [open, setOpen] = useState({});
  const [selected, setSelected] = useState(null);
  const detailRef = useRef(null);
  const acts = useMemo(() => activitiesOfDay(trip, day), [trip, day]);
  const legs = legsOf(trip, day);
  const color = dayColor(trip, day);
  const dayInfo = trip.days.find((d) => d.date === day);
  const dayNumber = trip.days.findIndex((d) => d.date === day) + 1;
  const lines = uniqueLines(legs);
  const withPin = acts.filter((a) => hasCoords(a)).length;
  const selIdx = acts.findIndex((a) => a.id === selected);
  const selAct = acts[selIdx];
  const selPrev = selIdx > 0 ? acts[selIdx - 1] : null;

  function choose(id) {
    setSelected(id);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function changeDay(d) {
    setDay(d);
    setSelected(null);
  }

  return (
    <div className="stack-gap">
      <div className="chips map-filter" role="group" aria-label="Escolher dia">
        {trip.days.map((d) => {
          const n = legsOf(trip, d.date).length;
          return (
            <button
              key={d.date}
              className={'chip' + (day === d.date ? ' on' : '')}
              onClick={() => changeDay(d.date)}
              style={day === d.date ? { borderColor: dayColor(trip, d.date), boxShadow: `inset 4px 0 0 ${dayColor(trip, d.date)}` } : undefined}
            >
              <span className="dot" style={{ background: dayColor(trip, d.date) }} /> {fmtDayShort(d.date)}
              {d.date === today && <span className="badge badge-info">hoje</span>}
              {n === 0 && <span className="muted small"> –</span>}
            </button>
          );
        })}
      </div>

      <section className="route-map-card">
        <div className="route-map-head">
          <span className="route-map-title">
            <strong>Dia {dayNumber}</strong> · {withPin} {withPin === 1 ? 'lugar' : 'lugares'}
          </span>
          <span className="small muted">Toque numa bolinha para ver como chegar</span>
        </div>
        <DayMap trip={trip} day={day} acts={acts} selectedId={selected} onSelect={choose} />
        {acts.length > withPin && (
          <p className="small muted route-map-foot">
            {acts.length - withPin} {acts.length - withPin === 1 ? 'parada sem pino' : 'paradas sem pino'} (hospedagem ou endereço sem coordenadas). Para marcar, use a aba Mapa → Buscar coordenadas.
          </p>
        )}
      </section>

      {selAct && (
        <section className="route-detail" ref={detailRef} style={{ borderTopColor: color }}>
          <div className="route-detail-head">
            <span className="leg-n" style={{ background: color }}>{selIdx + 1}</span>
            <span className="leg-title">
              <span className="leg-from">{selPrev ? selPrev.title : selAct.transfer?.steps?.[0]?.from || 'Hospedagem'}</span>
              <span className="leg-arrow" aria-hidden="true">↓</span>
              <strong className="leg-to">{selAct.title}</strong>
            </span>
            <button className="btn-icon" onClick={() => setSelected(null)} aria-label="Fechar trajeto">✕</button>
          </div>
          {(() => {
            const min = routeMinutes(selAct.transfer);
            const leave = departureTime(selAct.time, min);
            return (
              <p className="route-detail-time">
                {leave && <span>Saia <strong>{leave}</strong></span>}
                {selAct.time && <span className="muted"> · chegar {selAct.time}</span>}
                {min > 0 && <span className="muted"> · {fmtMinutes(min)}</span>}
              </p>
            );
          })()}
          {hasRoute(selAct.transfer) ? (
            <>
              <div className="leg-summary flush"><RouteSummary transfer={selAct.transfer} /></div>
              <RouteSteps transfer={selAct.transfer} />
              {selAct.transfer.note && <p className="leg-note">💡 {selAct.transfer.note}</p>}
            </>
          ) : (
            <p className="muted">Sem trajeto cadastrado para este lugar.</p>
          )}
          {selAct.alert && <div className="act-alert">⚠️ {selAct.alert}</div>}
        </section>
      )}

      <div className="routes-head" style={{ borderLeftColor: color }}>
        <h3>{fmtDayLong(day)}</h3>
        {dayInfo?.theme && <p className="muted">{dayInfo.theme}</p>}
        {lines.length > 0 && (
          <p className="routes-lines">
            <span className="small muted">Linhas do dia:</span> {lines.map((l) => <LineBadge key={l.kind + l.line} kind={l.kind} line={l.line} size="sm" />)}
          </p>
        )}
      </div>

      {!legs.length && <div className="empty">Nenhum deslocamento cadastrado neste dia.</div>}

      <ol className="legs">
        {legs.map(({ a, prev, n }) => {
          const min = routeMinutes(a.transfer);
          const leave = departureTime(a.time, min);
          const steps = a.transfer.steps || [];
          const transit = steps.some((s) => isTransit(s.kind));
          const isOpen = open[a.id] ?? transit; // trechos só a pé começam fechados
          const gm = steps.some((s) => s.kind === 'plane') ? null : googleMapsDirUrl([prev, a].filter(Boolean), 'transit');
          return (
            <li key={a.id} className={'leg' + (transit ? '' : ' leg-walk') + (a.id === selected ? ' leg-sel' : '')}>
              <button className="leg-head" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} aria-expanded={isOpen}>
                <span className="leg-n" style={{ background: color }}>{n}</span>
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
                  <div className="btn-row">
                    {hasCoords(a) && (
                      <button className="btn btn-small" onClick={() => { choose(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Ver no mapa do dia</button>
                    )}
                    {gm && (hasCoords(a) || a.address) && (
                      <a className="btn btn-small" target="_blank" rel="noreferrer" href={gm}>Google Maps</a>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <details className="card legend-card">
        <summary><strong>Como ler</strong></summary>
        <ul className="small">
          <li><strong>Bolinhas no mapa:</strong> os lugares do dia na ordem do roteiro. Toque numa para ver o trajeto até ela.</li>
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
  return acts.map((a, i) => ({ a, prev: acts[i - 1] || null, n: i + 1 })).filter(({ a }) => hasRoute(a.transfer));
}

function uniqueLines(legs) {
  const seen = new Map();
  for (const { a } of legs) for (const s of a.transfer.steps || []) if (isTransit(s.kind) && s.line) seen.set(s.kind + s.line, { kind: s.kind, line: s.line });
  return [...seen.values()];
}

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useStore } from '../lib/store.jsx';
import { activitiesOfDay, dayColor } from '../lib/model.js';
import { fmtDayShort } from '../lib/format.js';
import { geocode, googleMapsDirUrl, hasCoords } from '../lib/geo.js';
import { TILE_URL, TILE_ATTR, pinIcon, homeIcon } from '../components/LocationPicker.jsx';
import { toast } from '../components/ui.jsx';
import { modeIcon } from './Itinerary.jsx';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default function MapView({ trip }) {
  const { updateTrip } = useStore();
  const initialDay = new URLSearchParams(window.location.hash.split('?')[1] || '').get('dia') || 'todos';
  const [day, setDay] = useState(trip.days.some((d) => d.date === initialDay) ? initialDay : 'todos');
  const [adjust, setAdjust] = useState(false);
  const [mode, setMode] = useState('walking');
  const [geoBusy, setGeoBusy] = useState(false);
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef('');

  const days = day === 'todos' ? trip.days : trip.days.filter((d) => d.date === day);
  const byDay = useMemo(() => days.map((d) => ({ day: d, acts: activitiesOfDay(trip, d.date), color: dayColor(trip, d.date) })), [trip, day]);
  const missing = byDay.flatMap((g) => g.acts.filter((a) => !hasCoords(a)));

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const bounds = [];
    if (hasCoords(trip.lodging)) {
      const p = [Number(trip.lodging.lat), Number(trip.lodging.lng)];
      L.marker(p, { icon: homeIcon(), zIndexOffset: 1000 })
        .bindPopup(`<strong>🏠 ${esc(trip.lodging.name || 'Hospedagem')}</strong><br>${esc(trip.lodging.address)}`)
        .addTo(g);
      bounds.push(p);
    }
    for (const { day: d, acts, color } of byDay) {
      const line = [];
      acts.forEach((a, i) => {
        if (!hasCoords(a)) return;
        const p = [Number(a.lat), Number(a.lng)];
        line.push(p);
        bounds.push(p);
        const m = L.marker(p, { icon: pinIcon(color, String(i + 1)), draggable: adjust })
          .bindPopup(
            `<strong>${i + 1}. ${esc(a.title)}</strong><br><span>${esc(fmtDayShort(d.date))}${a.time ? ' · ' + esc(a.time) : ''}</span>` +
              (a.address ? `<br><small>${esc(a.address)}</small>` : '') +
              (a.alert ? `<br><small>⚠️ ${esc(a.alert)}</small>` : '') +
              (a.transfer?.mode ? `<br><small>${modeIcon(a.transfer.mode)} ${esc([a.transfer.mode, a.transfer.line, a.transfer.duration].filter(Boolean).join(' · '))}</small>` : '')
          )
          .addTo(g);
        if (adjust) {
          m.on('dragend', () => {
            const ll = m.getLatLng();
            updateTrip(trip.id, (t) => {
              const x = t.activities.find((y) => y.id === a.id);
              if (x) {
                x.lat = Math.round(ll.lat * 1e6) / 1e6;
                x.lng = Math.round(ll.lng * 1e6) / 1e6;
                x.updatedAt = Date.now();
              }
            });
            toast('Pino ajustado.');
          });
        }
      });
      if (line.length > 1) L.polyline(line, { color, weight: 3, opacity: 0.85, dashArray: day === 'todos' ? '6 6' : null }).addTo(g);
    }
    const key = day + '|' + bounds.length;
    if (fitted.current !== key) {
      if (bounds.length > 1) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else if (bounds.length === 1) map.current.setView(bounds[0], 14);
      fitted.current = key;
    }
  }, [byDay, adjust, trip.lodging]);

  async function geocodeMissing() {
    setGeoBusy(true);
    let ok = 0;
    const found = {};
    for (const a of missing) {
      const q = a.address || `${a.title}, ${trip.destination || ''} ${trip.country || ''}`;
      try {
        const r = await geocode(q, { near: trip.lodging });
        if (r[0]) {
          found[a.id] = r[0];
          ok++;
        }
      } catch {
        /* segue */
      }
      await new Promise((res) => setTimeout(res, 1100)); // política de uso do Nominatim: 1 req/s
    }
    await updateTrip(trip.id, (t) => {
      for (const x of t.activities) if (found[x.id]) Object.assign(x, { lat: found[x.id].lat, lng: found[x.id].lng, updatedAt: Date.now() });
    });
    setGeoBusy(false);
    toast(`${ok} de ${missing.length} endereços localizados. Confira os pinos.`, ok === missing.length ? 'ok' : 'warn');
  }

  const routeFor = (acts) => googleMapsDirUrl([trip.lodging, ...acts], mode);

  return (
    <div className="map-page">
      <div className="chips map-filter" role="group" aria-label="Filtrar por dia">
        <button className={'chip' + (day === 'todos' ? ' on' : '')} onClick={() => setDay('todos')}>Todos</button>
        {trip.days.map((d, i) => (
          <button key={d.date} className={'chip' + (day === d.date ? ' on' : '')} onClick={() => setDay(d.date)} style={day === d.date ? { borderColor: dayColor(trip, d.date), boxShadow: `inset 4px 0 0 ${dayColor(trip, d.date)}` } : undefined}>
            <span className="dot" style={{ background: dayColor(trip, d.date) }} /> Dia {i + 1} · {fmtDayShort(d.date)}
          </button>
        ))}
      </div>

      <div ref={el} className="map" />

      <div className="map-tools">
        <label className="check">
          <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
          <span>Ajustar pinos (arrastar)</span>
        </label>
        <label className="inline-select">
          Rota no Google Maps:
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="walking">a pé</option>
            <option value="transit">transporte público</option>
            <option value="driving">carro</option>
          </select>
        </label>
      </div>
      {mode === 'transit' && <p className="small muted">No modo transporte público o Google Maps ignora as paradas intermediárias. Use os links de cada trecho abaixo.</p>}

      {missing.length > 0 && (
        <div className="alert alert-warn">
          {missing.length} {missing.length === 1 ? 'atividade sem' : 'atividades sem'} coordenadas: {missing.map((a) => a.title).join(', ')}.{' '}
          <button className="btn btn-small" onClick={geocodeMissing} disabled={geoBusy}>{geoBusy ? 'Buscando…' : 'Buscar coordenadas'}</button>
        </div>
      )}

      <div className="map-days">
        {byDay.map(({ day: d, acts, color }) => (
          <section key={d.date} className="map-day" style={{ borderLeftColor: color }}>
            <div className="map-day-head">
              <strong>{fmtDayShort(d.date)}</strong>
              {d.theme && <span className="muted"> · {d.theme}</span>}
              {acts.length > 0 && (
                <a className="btn btn-small" target="_blank" rel="noreferrer" href={routeFor(acts)}>Abrir percurso no Google Maps</a>
              )}
            </div>
            {acts.length ? (
              <ol className="map-acts">
                {acts.map((a, i) => {
                  const prev = i === 0 ? trip.lodging : acts[i - 1];
                  const leg = googleMapsDirUrl([prev, a], 'transit');
                  return (
                    <li key={a.id}>
                      <span className="act-num small-num" style={{ background: color }}>{i + 1}</span>
                      <span className="grow">
                        {a.time && <span className="act-time">{a.time}</span>} {a.title}
                        {!hasCoords(a) && <span className="small text-danger"> · sem pino</span>}
                      </span>
                      {leg && <a className="link small" target="_blank" rel="noreferrer" href={leg}>🚇 trecho ↗</a>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="small muted">Sem atividades.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

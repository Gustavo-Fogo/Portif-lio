// Endereço + busca de coordenadas (Nominatim) + mini mapa com pino arrastável
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { geocode, hasCoords } from '../lib/geo.js';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function pinIcon(color = '#1f5fae', label = '') {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin" style="background:${color}"><span>${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

export function homeIcon() {
  return L.divIcon({ className: 'pin-wrap', html: '<div class="pin pin-home"><span>🏠</span></div>', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
}

export default function LocationPicker({ address, lat, lng, onChange, near, placeholder = 'Rua, número, cidade' }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const mapEl = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const latest = useRef({ address, onChange });
  latest.current = { address, onChange };

  const pos = hasCoords({ lat, lng }) ? [Number(lat), Number(lng)] : null;

  useEffect(() => {
    if (!pos || !mapEl.current) return;
    if (!map.current) {
      map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(pos, 15);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map.current);
      marker.current = L.marker(pos, { draggable: true, icon: pinIcon('#e34948', '') }).addTo(map.current);
      marker.current.on('dragend', () => {
        const p = marker.current.getLatLng();
        latest.current.onChange({ address: latest.current.address, lat: round6(p.lat), lng: round6(p.lng) });
      });
      map.current.on('click', (e) => {
        marker.current.setLatLng(e.latlng);
        latest.current.onChange({ address: latest.current.address, lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) });
      });
    } else {
      const cur = marker.current.getLatLng();
      if (Math.abs(cur.lat - pos[0]) > 1e-7 || Math.abs(cur.lng - pos[1]) > 1e-7) {
        marker.current.setLatLng(pos);
        map.current.setView(pos, Math.max(map.current.getZoom(), 14));
      }
    }
  }, [pos?.[0], pos?.[1]]);

  useEffect(() => () => map.current?.remove(), []);

  async function search() {
    setErr('');
    setBusy(true);
    try {
      const r = await geocode(address, { near });
      setResults(r);
      if (!r.length) setErr('Nenhum resultado. Tente incluir cidade e país.');
      if (r.length === 1) choose(r[0]);
    } catch (e) {
      setErr(navigator.onLine ? e.message : 'Sem internet para buscar o endereço.');
    } finally {
      setBusy(false);
    }
  }

  function choose(r) {
    onChange({ address, lat: round6(r.lat), lng: round6(r.lng) });
    setResults(null);
  }

  return (
    <div className="locpicker">
      <div className="row-input">
        <input value={address || ''} placeholder={placeholder} onChange={(e) => onChange({ address: e.target.value, lat, lng })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())} />
        <button type="button" className="btn" onClick={search} disabled={busy || !address}>
          {busy ? 'Buscando…' : '📍 Buscar'}
        </button>
      </div>
      {err && <p className="field-hint text-danger">{err}</p>}
      {results && results.length > 1 && (
        <ul className="geo-results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => choose(r)}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
      {pos ? (
        <>
          <div ref={mapEl} className="minimap" />
          <p className="field-hint">
            Arraste o pino (ou toque no mapa) para ajustar. {pos[0].toFixed(5)}, {pos[1].toFixed(5)}{' '}
            <button type="button" className="link" onClick={() => onChange({ address, lat: null, lng: null })}>remover pino</button>
          </p>
        </>
      ) : (
        <p className="field-hint">Sem coordenadas. Toque em “Buscar” para localizar o endereço no mapa.</p>
      )}
    </div>
  );
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

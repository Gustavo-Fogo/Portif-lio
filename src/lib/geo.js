// Geocodificação (Nominatim/OpenStreetMap) e links do Google Maps
export async function geocode(query, { lang = 'pt-BR', near } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const params = new URLSearchParams({ format: 'jsonv2', limit: '5', q, 'accept-language': lang });
  if (near?.lat && near?.lng) {
    // Prioriza resultados próximos da hospedagem (~60 km), sem restringir.
    const d = 0.6;
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('Busca falhou (HTTP ' + r.status + ')');
  const j = await r.json();
  return j.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }));
}

const hasCoords = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null;
export { hasCoords };

const pointStr = (p) => (hasCoords(p) ? `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}` : p.address || p.title || '');

/** Link de rotas do Google Maps: origem, paradas e destino. */
export function googleMapsDirUrl(points, travelmode = 'transit') {
  const pts = points.filter((p) => hasCoords(p) || p.address);
  if (!pts.length) return null;
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pointStr(pts[0]))}`;
  const origin = pts[0];
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(1, -1).map(pointStr).join('|');
  const params = new URLSearchParams({ api: '1', origin: pointStr(origin), destination: pointStr(destination), travelmode });
  if (waypoints) params.set('waypoints', waypoints);
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

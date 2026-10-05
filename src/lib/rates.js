// Cotação do dia (APIs gratuitas sem chave), com fallback
export async function fetchRate(currency, fetchImpl = fetch) {
  const cur = String(currency || 'EUR').toUpperCase();
  if (cur === 'BRL') return { value: 1, fetchedAt: Date.now(), quotedAt: null, source: '—' };
  const errors = [];
  try {
    const r = await fetchImpl(`https://economia.awesomeapi.com.br/json/last/${cur}-BRL`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const q = j[`${cur}BRL`];
    const value = Number(q?.bid);
    if (!(value > 0)) throw new Error('resposta inválida');
    const quotedAt = q.timestamp ? Number(q.timestamp) * 1000 : Date.parse(String(q.create_date).replace(' ', 'T')) || null;
    return { value, fetchedAt: Date.now(), quotedAt, source: 'AwesomeAPI (comercial)' };
  } catch (e) {
    errors.push('AwesomeAPI: ' + e.message);
  }
  try {
    const r = await fetchImpl(`https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=BRL`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const value = Number(j?.rates?.BRL);
    if (!(value > 0)) throw new Error('resposta inválida');
    return { value, fetchedAt: Date.now(), quotedAt: j.date ? Date.parse(j.date + 'T16:00:00Z') : null, source: 'Frankfurter (BCE)' };
  } catch (e) {
    errors.push('Frankfurter: ' + e.message);
  }
  throw new Error('Não foi possível buscar a cotação. ' + errors.join(' | '));
}

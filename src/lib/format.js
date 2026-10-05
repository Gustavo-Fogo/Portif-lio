// Formatação de valores e datas (pt-BR)

const moneyFormatters = {};

export function fmtMoney(value, currency = 'BRL') {
  const v = Number(value) || 0;
  if (!moneyFormatters[currency]) {
    try {
      moneyFormatters[currency] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    } catch {
      moneyFormatters[currency] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    }
  }
  // Intl usa espaço não separável; normalizamos para espaço comum.
  return moneyFormatters[currency].format(v).replace(/ /g, ' ');
}

export const fmtBRL = (v) => fmtMoney(v, 'BRL');

export function fmtNumber(v, digits = 2) {
  return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtRate(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** 'YYYY-MM-DD' -> Date local (sem fuso). */
export function parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 10/11/2026 */
export function fmtDate(iso) {
  const d = parseISODate(iso);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR');
}

/** ter, 10/11 */
export function fmtDayShort(iso) {
  const d = parseISODate(iso);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]}, ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

/** terça-feira, 10 de novembro */
export function fmtDayLong(iso) {
  const d = parseISODate(iso);
  if (!d) return '';
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Lista de datas ISO entre início e fim (inclusive). */
export function dateRange(startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (!start || !end || end < start) return start ? [toISODate(start)] : [];
  const out = [];
  const d = new Date(start);
  while (d <= end && out.length < 120) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function daysBetween(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Remove acentos e normaliza para comparação. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9€$]+/g, ' ')
    .trim();
}

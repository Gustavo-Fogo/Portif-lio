// Exportar / importar todos os dados (.json), com substituição ou mesclagem
import { DATA_VERSION, syncDays } from './model.js';

export const BACKUP_FORMAT = 'organizador-viagens';
export const ARRAY_KEYS = ['participants', 'categories', 'expenses', 'days', 'activities', 'transports', 'checklist', 'risks'];

export function buildBackup({ trips, rates, deletedTrips }) {
  return {
    format: BACKUP_FORMAT,
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    trips,
    rates: rates || {},
    deletedTrips: deletedTrips || {},
  };
}

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `viagens-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

/** Valida um JSON de backup. Lança erro com mensagem amigável. */
export function parseBackup(json) {
  let data = json;
  if (typeof data === 'string') data = JSON.parse(data);
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.trips)) {
    throw new Error('Este arquivo não é um backup do Organizador de Viagens.');
  }
  for (const t of data.trips) normalizeTrip(t);
  return data;
}

/** Completa campos ausentes (dados antigos/parciais). */
export function normalizeTrip(t) {
  for (const k of ARRAY_KEYS) if (!Array.isArray(t[k])) t[k] = [];
  t.deleted ||= {};
  t.lodging ||= { name: '', address: '', lat: null, lng: null };
  t.exchange ||= { spreadPct: 4, iofPct: 3.5, manualRate: null };
  t.detax ||= { ratePct: 12, minAmount: 100.01 };
  t.currency ||= 'EUR';
  t.updatedAt ||= 0;
  syncDays(t);
  return t;
}

function mergeList(a = [], b = [], deleted = {}) {
  const map = new Map();
  for (const item of [...a, ...b]) {
    const key = item.id ?? item.date;
    const cur = map.get(key);
    if (!cur || (item.updatedAt || 0) > (cur.updatedAt || 0)) map.set(key, item);
  }
  return [...map.values()].filter((item) => !(deleted[item.id] && deleted[item.id] >= (item.updatedAt || 0)));
}

/** Mescla duas versões da mesma viagem, item a item (o mais recente vence). */
export function mergeTrip(local, incoming) {
  const newer = (incoming.updatedAt || 0) > (local.updatedAt || 0) ? incoming : local;
  const deleted = { ...(local.deleted || {}) };
  for (const [id, ts] of Object.entries(incoming.deleted || {})) deleted[id] = Math.max(ts, deleted[id] || 0);
  const out = { ...local, ...newer, deleted };
  for (const k of ARRAY_KEYS) out[k] = mergeList(local[k], incoming[k], deleted);
  out.updatedAt = Math.max(local.updatedAt || 0, incoming.updatedAt || 0);
  return normalizeTrip(out);
}

/**
 * Resultado da importação.
 * mode 'replace': os dados do arquivo substituem tudo.
 * mode 'merge': viagens novas são adicionadas; as que existem nos dois são mescladas.
 */
export function applyImport(localTrips, backup, mode, localDeletedTrips = {}) {
  if (mode === 'replace') {
    return { trips: backup.trips.map(normalizeTrip), deletedTrips: backup.deletedTrips || {} };
  }
  const deletedTrips = { ...localDeletedTrips };
  for (const [id, ts] of Object.entries(backup.deletedTrips || {})) deletedTrips[id] = Math.max(ts, deletedTrips[id] || 0);
  // A viagem inicial criada automaticamente num aparelho novo, se nunca foi editada,
  // é descartada quando o backup traz uma viagem de mesmo nome (evita duplicar).
  const names = new Set(backup.trips.map((t) => t.name));
  const keep = localTrips.filter((t) => !(isPristineSeed(t) && names.has(t.name) && !backup.trips.some((b) => b.id === t.id)));
  const map = new Map(keep.map((t) => [t.id, t]));
  for (const t of backup.trips) {
    const cur = map.get(t.id);
    map.set(t.id, cur ? mergeTrip(cur, t) : normalizeTrip(t));
  }
  const trips = [...map.values()].filter((t) => !(deletedTrips[t.id] && deletedTrips[t.id] >= (t.updatedAt || 0)));
  return { trips, deletedTrips };
}

export const isPristineSeed = (t) => !!t.seed && t.updatedAt === t.createdAt;

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJSON(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

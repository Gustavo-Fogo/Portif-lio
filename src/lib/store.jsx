// Estado global: viagens + cotações, sincronizado com o IndexedDB
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from './db.js';
import { now, parisSeed, syncDays } from './model.js';
import { fetchRate } from './rates.js';
import { normalizeTrip } from './backup.js';

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState({ loaded: false, trips: [], rates: {}, deletedTrips: {}, error: null });
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    (async () => {
      try {
        let trips = await db.getAllTrips();
        const seeded = await db.getMeta('seeded');
        if (!trips.length && !seeded) {
          const paris = parisSeed();
          await db.putTrip(paris);
          trips = [paris];
        }
        if (!seeded) await db.setMeta('seeded', true);
        const rates = (await db.getMeta('rates')) || {};
        const deletedTrips = (await db.getMeta('deletedTrips')) || {};
        // Pede ao navegador para não apagar os dados em caso de pouco espaço.
        navigator.storage?.persist?.().catch(() => {});
        setState({ loaded: true, trips: trips.map(normalizeTrip), rates, deletedTrips, error: null });
      } catch (e) {
        setState((s) => ({ ...s, loaded: true, error: 'Não foi possível abrir o armazenamento local: ' + e.message }));
      }
    })();
  }, []);

  const saveTrip = useCallback(async (trip) => {
    trip.updatedAt = now();
    syncDays(trip);
    setState((s) => {
      const exists = s.trips.some((t) => t.id === trip.id);
      return { ...s, trips: exists ? s.trips.map((t) => (t.id === trip.id ? trip : t)) : [...s.trips, trip] };
    });
    await db.putTrip(trip);
    return trip;
  }, []);

  /** Atualiza uma viagem aplicando fn sobre uma cópia. */
  const updateTrip = useCallback(
    (id, fn) => {
      const cur = ref.current.trips.find((t) => t.id === id);
      if (!cur) return null;
      const draft = structuredClone(cur);
      fn(draft);
      return saveTrip(draft);
    },
    [saveTrip]
  );

  const removeTrip = useCallback(async (id) => {
    const deletedTrips = { ...ref.current.deletedTrips, [id]: now() };
    setState((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id), deletedTrips }));
    await db.deleteTrip(id);
    await db.setMeta('deletedTrips', deletedTrips);
  }, []);

  const replaceAll = useCallback(async (trips, deletedTrips = {}) => {
    await db.replaceAllTrips(trips);
    await db.setMeta('deletedTrips', deletedTrips);
    setState((s) => ({ ...s, trips, deletedTrips }));
  }, []);

  const setRates = useCallback(async (rates) => {
    const merged = { ...ref.current.rates, ...rates };
    setState((s) => ({ ...s, rates: merged }));
    await db.setMeta('rates', merged);
  }, []);

  const refreshRate = useCallback(
    async (currency) => {
      const r = await fetchRate(currency);
      await setRates({ [currency]: r });
      return r;
    },
    [setRates]
  );

  const value = useMemo(
    () => ({ ...state, saveTrip, updateTrip, removeTrip, replaceAll, setRates, refreshRate }),
    [state, saveTrip, updateTrip, removeTrip, replaceAll, setRates, refreshRate]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// ---------- Ajudantes para listas dentro da viagem ----------
export function upsertItem(trip, key, item) {
  item.updatedAt = now();
  const list = trip[key] || (trip[key] = []);
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
  return item;
}

export function removeItem(trip, key, id) {
  trip[key] = (trip[key] || []).filter((x) => x.id !== id);
  trip.deleted ||= {};
  trip.deleted[id] = now();
}

// ---------- Navegação por hash ----------
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  return parts;
}

export const go = (path) => {
  window.location.hash = path.startsWith('#') ? path : '#' + path;
  window.scrollTo(0, 0);
};

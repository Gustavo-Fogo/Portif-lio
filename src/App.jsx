import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore, useRoute, go } from './lib/store.jsx';
import { Toaster } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import TripForm from './pages/TripForm.jsx';
import TripView from './pages/TripView.jsx';
import DataPage from './pages/DataPage.jsx';

const ImportSheet = lazy(() => import('./pages/ImportSheet.jsx'));

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function App() {
  const store = useStore();
  const route = useRoute();
  const online = useOnline();

  let page;
  if (!store.loaded) page = <div className="loading">Carregando…</div>;
  else if (store.error) page = <div className="container"><div className="alert alert-danger">{store.error}</div></div>;
  else if (route[0] === 'nova') page = <TripForm />;
  else if (route[0] === 'dados') page = <DataPage />;
  else if (route[0] === 'v' && route[1]) {
    const trip = store.trips.find((t) => t.id === route[1]);
    if (!trip) page = <NotFound />;
    else if (route[2] === 'editar') page = <TripForm trip={trip} />;
    else if (route[2] === 'importar') page = <Suspense fallback={<div className="loading">Carregando…</div>}><ImportSheet trip={trip} /></Suspense>;
    else page = <TripView trip={trip} tab={route[2] || 'resumo'} />;
  } else page = <Home />;

  return (
    <>
      {!online && <div className="offline-bar">Sem internet: usando dados salvos neste aparelho.</div>}
      {page}
      <Toaster />
    </>
  );
}

function NotFound() {
  return (
    <div className="container">
      <p>Viagem não encontrada.</p>
      <button className="btn" onClick={() => go('/')}>Voltar</button>
    </div>
  );
}

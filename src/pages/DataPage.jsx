import { useState } from 'react';
import { useStore, go } from '../lib/store.jsx';
import { buildBackup, backupFileName, downloadJSON, parseBackup, applyImport } from '../lib/backup.js';
import { convertLegacy, readLegacyFromLocalStorage, LEGACY_KEY } from '../lib/legacy.js';
import { fmtDate } from '../lib/format.js';
import { Card, Modal, readFileAs, toast } from '../components/ui.jsx';

export default function DataPage() {
  const { trips, rates, deletedTrips, replaceAll, setRates } = useStore();
  const [pending, setPending] = useState(null); // backup aguardando escolha substituir/mesclar
  const [legacy, setLegacy] = useState(null);
  const [legacyText, setLegacyText] = useState('');
  const [err, setErr] = useState('');

  function exportAll() {
    downloadJSON(buildBackup({ trips, rates, deletedTrips }), backupFileName());
    toast('Backup exportado. Envie o arquivo para o outro aparelho.');
  }

  async function onBackupFile(file) {
    setErr('');
    try {
      const text = await readFileAs(file);
      const data = parseBackup(text);
      setPending({ data, fileName: file.name });
    } catch (e) {
      setErr(e instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : e.message);
    }
  }

  async function doImport(mode) {
    const { trips: next, deletedTrips: del } = applyImport(trips, pending.data, mode, deletedTrips);
    await replaceAll(next, del);
    // Traz as cotações do backup quando forem mais recentes (útil offline).
    const newer = Object.fromEntries(Object.entries(pending.data.rates || {}).filter(([cur, r]) => r?.value > 0 && (!rates[cur] || r.fetchedAt > rates[cur].fetchedAt)));
    if (Object.keys(newer).length) await setRates(newer);
    setPending(null);
    toast(mode === 'replace' ? 'Dados substituídos pelo backup.' : 'Backup mesclado com os dados deste aparelho.');
    go('/');
  }

  function parseLegacy(text) {
    setErr('');
    try {
      const res = convertLegacy(text);
      setLegacy(res);
    } catch (e) {
      setErr('Não consegui ler o JSON antigo: ' + e.message);
    }
  }

  async function importLegacy() {
    await replaceAll([...trips, ...legacy.trips], deletedTrips);
    toast(`${legacy.trips.length} viagem(ns) importada(s) do formato antigo.`);
    setLegacy(null);
    setLegacyText('');
    go('/');
  }

  const fromLocal = readLegacyFromLocalStorage();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="btn btn-ghost" onClick={() => go('/')}>← Voltar</button>
          <h1 className="topbar-title">Backup e dados</h1>
        </div>
      </header>
      <main className="container stack-gap">
        {err && <div className="alert alert-danger">{err}</div>}

        <Card title="1. Exportar (.json)">
          <p>Salva <strong>todas as viagens</strong> deste aparelho em um arquivo. Use para levar os dados ao celular/computador ou como cópia de segurança.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={exportAll}>⬇️ Exportar backup</button>
          <p className="small muted">{trips.length} viagem(ns) · os dados ficam apenas neste aparelho até você exportar.</p>
        </Card>

        <Card title="2. Importar backup (.json)">
          <p>Escolha um arquivo exportado por este app. Depois você decide se quer <strong>substituir</strong> ou <strong>mesclar</strong>.</p>
          <label className="file-drop">
            <input type="file" accept=".json,application/json" onChange={(e) => e.target.files[0] && onBackupFile(e.target.files[0])} />
            <span>📂 Escolher arquivo de backup</span>
          </label>
        </Card>

        <Card title="3. Importar do formato antigo (viagens.html)">
          <p className="small">
            O sistema antigo guardava os dados no navegador, na chave <code>{LEGACY_KEY}</code>. Para copiar: abra o <em>viagens.html</em> no navegador, abra o console (F12 → Console) e rode <code>copy(localStorage.getItem('{LEGACY_KEY}'))</code>. Depois cole abaixo ou salve num arquivo .json.
          </p>
          {fromLocal && (
            <button className="btn" onClick={() => parseLegacy(fromLocal)}>Encontrei dados antigos neste navegador — converter</button>
          )}
          <textarea rows={4} placeholder="Cole aqui o JSON antigo…" value={legacyText} onChange={(e) => setLegacyText(e.target.value)} />
          <div className="btn-row">
            <button className="btn" disabled={!legacyText.trim()} onClick={() => parseLegacy(legacyText)}>Converter texto colado</button>
            <label className="btn file-btn">
              <input type="file" accept=".json,.txt,application/json" onChange={async (e) => e.target.files[0] && parseLegacy(await readFileAs(e.target.files[0]))} />
              Escolher arquivo .json
            </label>
          </div>
          <p className="small muted">O número de pessoas, o mapa esquemático e a viagem de exemplo do sistema antigo são descartados. Revise participantes e quem pagou depois de importar.</p>
        </Card>

        <Card title="Como passar os dados do computador para o celular">
          <ol className="howto">
            <li>No aparelho de origem: <strong>Exportar backup</strong>.</li>
            <li>Envie o arquivo para o outro aparelho (WhatsApp para você mesmo, e-mail, Google Drive, AirDrop…).</li>
            <li>No outro aparelho, abra o app → <strong>Backup e dados</strong> → <strong>Importar backup</strong> e escolha o arquivo.</li>
            <li>Escolha <strong>Mesclar</strong> para juntar as alterações dos dois aparelhos, ou <strong>Substituir</strong> para deixar igual ao arquivo.</li>
          </ol>
        </Card>
      </main>

      {pending && (
        <Modal title="Importar backup" onClose={() => setPending(null)}>
          <p>
            Arquivo <strong>{pending.fileName}</strong>, exportado em {fmtDate(pending.data.exportedAt?.slice(0, 10))}, com {pending.data.trips.length} viagem(ns):
          </p>
          <ul className="small">{pending.data.trips.map((t) => <li key={t.id}>{t.name} ({t.expenses.length} gastos, {t.activities.length} atividades){trips.some((x) => x.id === t.id) ? ' — já existe aqui' : ' — nova'}</li>)}</ul>
          <div className="choice">
            <button className="btn btn-primary btn-lg btn-block" onClick={() => doImport('merge')}>Mesclar</button>
            <p className="small muted">Junta as viagens. Quando o mesmo item foi alterado nos dois aparelhos, fica a versão mais recente. Itens excluídos continuam excluídos.</p>
            <button className="btn btn-danger btn-lg btn-block" onClick={() => confirm('Substituir TODOS os dados deste aparelho pelo arquivo?') && doImport('replace')}>Substituir tudo</button>
            <p className="small muted">Apaga as viagens deste aparelho e deixa exatamente como no arquivo.</p>
          </div>
        </Modal>
      )}

      {legacy && (
        <Modal
          title="Converter formato antigo"
          onClose={() => setLegacy(null)}
          footer={<><span className="spacer" /><button className="btn" onClick={() => setLegacy(null)}>Cancelar</button><button className="btn btn-primary" onClick={importLegacy}>Importar como nova(s) viagem(ns)</button></>}
        >
          {legacy.report.map((r, i) => (
            <div key={i} className="card">
              <strong>{r.trip}</strong>
              <ul className="small">
                <li>{r.expenses} gastos/compras</li>
                <li>{r.activities} atividades no roteiro</li>
                <li>{r.transports} transportes fixos</li>
                <li>{r.checklist} itens de checklist · {r.risks} riscos/alertas</li>
                {r.ignored.length > 0 && <li className="muted">Descartado: {r.ignored.join(', ')}</li>}
              </ul>
            </div>
          ))}
          {legacy.report.every((r) => !r.expenses && !r.activities) && (
            <div className="alert alert-warn">Não reconheci gastos nem roteiro nesse JSON. Confira se copiou o conteúdo certo.</div>
          )}
        </Modal>
      )}
    </>
  );
}

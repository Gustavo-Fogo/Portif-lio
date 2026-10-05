# Arquitetura

## Visão geral

Aplicação **estática** (sem backend) em **React + Vite**, instalável como **PWA**.
Todos os dados ficam no aparelho, em **IndexedDB**. A troca entre aparelhos é feita
por arquivo `.json` (exportar/importar, com opção de substituir ou mesclar).

```
Navegador
 ├─ React (telas)
 ├─ store.jsx ── estado em memória ⇄ IndexedDB (db.js)
 ├─ lib/ (lógica pura, testada com Vitest)
 │   money.js     câmbio, totais, divisão, acerto de contas, Detax
 │   backup.js    exportar / importar / mesclar (item a item, com exclusões)
 │   parse.js     reconhecimento de colunas e valores de planilha
 │   spreadsheet.js leitura .xlsx/.csv (SheetJS, carregado sob demanda)
 │   legacy.js    conversão do formato antigo (travelPlannerData_v1)
 │   exportXlsx.js exportação dos gastos para .xlsx
 │   rates.js     cotação do dia (AwesomeAPI → fallback Frankfurter)
 │   geo.js       Nominatim (endereço → coordenadas) e links do Google Maps
 └─ Service worker (Workbox): app inteiro em cache + blocos do mapa já vistos
```

Serviços externos usados (todos gratuitos e sem chave):

| Serviço | Para quê | Offline |
|---|---|---|
| AwesomeAPI / Frankfurter | cotação do dia | usa a última cotação salva |
| Nominatim (OpenStreetMap) | endereço → coordenadas | não busca; pinos já salvos continuam |
| Tiles OpenStreetMap | fundo do mapa | mostra as áreas já vistas (cache) |

## Estrutura de arquivos

```
index.html               página base (pt-BR, tema claro)
vite.config.js           build + PWA (manifesto, service worker, cache do mapa)
netlify.toml             publicação no Netlify
.github/workflows/deploy.yml  publicação no GitHub Pages
public/                  ícones do app
src/
  main.jsx, App.jsx      entrada e rotas (#/, #/nova, #/dados, #/v/:id/:aba)
  styles.css             estilos (mobile-first)
  lib/                   lógica (ver acima) + model.js (modelo e constantes) + format.js
  components/            ui.jsx (modal, campos, chips…), Charts.jsx, LocationPicker.jsx
  pages/                 Home, TripForm, TripView (abas), Summary, Finance, ExpenseForm,
                         Itinerary, ActivityForm, MapView, Checklist, ImportSheet, DataPage
tests/lib.test.js        testes da lógica
docs/                    esta documentação e o guia de uso
```

## Modelo de dados (resumo)

```js
Trip {
  id, name, destination, country, startDate, endDate, currency,   // moeda local (EUR…)
  lodging: { name, address, lat, lng },
  participants: [{ id, name }],
  categories:   [{ id, name, color }],
  exchange: { spreadPct, iofPct, manualRate },     // acréscimo do cartão = spread + IOF
  detax:    { ratePct, minAmount },
  expenses: [Expense], days: [{ date, theme }], activities: [Activity],
  transports: [...], checklist: [...], risks: [...],
  deleted: { [itemId]: timestamp },                // exclusões, para a mesclagem
  createdAt, updatedAt
}
Expense {
  description, vendor, categoryId, qty, unitPrice, currency (BRL | moeda local),
  moment: 'antes'|'durante', day, type: 'fixo'|'flexivel',
  status: 'pago'|'a_pagar'|'estimado', dueDate, paymentMethod,
  paidBy, split: { mode: 'individual'|'igual', people: [ids] },
  detax, paidBRL (valor real pago em R$), note, source, activityId
}
Activity { date, order, time, title, address, lat, lng, note, alert, cost, costCurrency,
           expenseId, transfer: { duration, mode, line, note } }
```

## Regras de cálculo

- **Valor em R$**: BRL fica como está. Gasto em moeda estrangeira **pago** e com
  `paidBRL` preenchido usa esse valor real. Os demais usam `total × cotação`,
  e `× (1 + spread + IOF)` quando a forma de pagamento é cartão de crédito/débito.
- **Cotação**: a manual, se preenchida; senão a última buscada (guardada com data/hora).
- **Divisão**: individual (uma pessoa) ou igual entre as pessoas selecionadas.
- **Acerto de contas**: saldo = quanto pagou − sua parte; transferências mínimas
  (devedor maior → credor maior). Por padrão considera pagos + a pagar; dá para incluir estimados.
- **Detax**: compras marcadas, agrupadas por loja + dia; só contam grupos acima do mínimo.
- **Mesclagem**: por id de item, vence o `updatedAt` mais recente; exclusões registradas
  em `deleted` não "ressuscitam".

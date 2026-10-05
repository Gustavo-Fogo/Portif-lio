# ✈️ Organizador de Viagens

Sistema web para organizar viagens: **financeiro** (câmbio, cartão, divisão de gastos e
acerto de contas, Detax), **roteiro** por dia com deslocamentos, **mapa** (Leaflet +
OpenStreetMap), **checklist** e **riscos/alertas**. Serve para qualquer viagem futura.
A primeira viagem cadastrada é Paris (10–14/11/2026, 4 pessoas, hospedagem em Le Blanc-Mesnil).

- Aplicação estática, sem backend, em React + Vite
- PWA: instalável no celular e funciona offline
- Dados no aparelho (IndexedDB), com exportar/importar `.json` (substituir ou mesclar)
- Importa planilha `.xlsx`/`.csv` (abas Resumo, Gastos e Compras) com mapeamento de colunas,
  prévia e conferência dos totais. Também importa o JSON do `viagens.html` antigo e exporta os gastos para `.xlsx`.

📘 **[Guia de uso, publicação e transferência de dados](docs/GUIA.md)**
🏗️ **[Arquitetura e modelo de dados](docs/ARQUITETURA.md)**

```bash
npm install && npm run dev
```

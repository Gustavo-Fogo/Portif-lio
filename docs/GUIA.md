# Guia rápido — Organizador de Viagens

## 1. Usar

**Tela inicial**: suas viagens, separadas por ano e mês. Toque em **+ Nova viagem**
para cadastrar outra (nome, destino, datas, moeda local, hospedagem e participantes).
A viagem **Paris 2026** já vem cadastrada: 10 a 14/11/2026, 4 pessoas, hospedagem em
Le Blanc-Mesnil. Toque em **Editar** para trocar "Pessoa 1…4" pelos nomes reais.

Dentro da viagem há 5 abas:

| Aba | O que tem |
|---|---|
| **Resumo** | total em R$ (pago, a pagar, estimado), totais por moeda, gráficos, total por pessoa, **quem deve para quem**, próximos vencimentos e Detax |
| **Financeiro** | câmbio (cotação do dia, spread e IOF do cartão, cotação manual), lista de gastos com filtros, **+ Novo gasto**, **Importar planilha**, **Exportar .xlsx** |
| **Roteiro** | transporte fixo (voos, trens…), um bloco por dia com tema, atividades, deslocamentos e alertas. Use ▲▼ (ou arraste, no computador) para reordenar. Uma atividade com custo pode virar gasto com **Lançar no Financeiro** |
| **Mapa** | pinos numerados por dia (uma cor por dia), linha ligando os pontos, 🏠 hospedagem, filtro por dia, **Abrir percurso no Google Maps** e links de cada trecho em transporte público |
| **Checklist** | itens de preparação marcáveis e lista de riscos/alertas (alertas com data aparecem também no dia do roteiro) |

### Dicas
- **Gasto já pago em euro**: depois que a fatura fechar, abra o gasto e preencha
  "Valor efetivamente pago em reais". O total pago passa a refletir o valor real.
- **Endereços no mapa**: no cadastro da atividade, digite o endereço e toque em
  **📍 Buscar**. Depois arraste o pino se precisar. No Mapa, **Buscar coordenadas**
  localiza de uma vez as atividades que ainda estão sem pino. Para corrigir um pino,
  marque **Ajustar pinos** e arraste.
- **Detax**: marque a opção nas compras que permitem restituição. O Resumo soma por
  loja e por dia e avisa quando o valor fica abaixo do mínimo (€100,01 na França).
  O percentual e o mínimo ficam em **Editar**.
- **Categorias** e **participantes** também são editados em **Editar**.

### Importar a planilha existente
Financeiro → **Importar planilha** → escolha o `.xlsx` ou `.csv`.
1. O app reconhece as abas **Gastos**, **Compras** e **Resumo**. Se precisar, troque o papel de cada aba.
2. Confira qual coluna corresponde a cada campo. As sugestões vêm do nome da coluna.
   Escolha os **valores padrão** para o que a planilha não tem (quem pagou, divisão, status…).
3. **Prévia**: linhas com erro ficam em vermelho e desmarcadas (por exemplo, "Subtotal"), e linhas com aviso ficam em amarelo.
   Dá para marcar ou desmarcar cada linha.
4. **Conferência**: o app compara o total importado com os totais da aba Resumo e avisa
   se houver diferença.

Ao reimportar a planilha atualizada, marque "Apagar antes os gastos importados de
planilha" para não duplicar.

### Importar dados do viagens.html antigo
1. Abra o `viagens.html` antigo no navegador em que ele era usado.
2. Aperte **F12**, vá em **Console** e rode:
   `copy(localStorage.getItem('travelPlannerData_v1'))`
3. No app novo: **Backup e dados** → item 3 → cole o texto → **Converter texto colado** → confira o resumo → **Importar**.

O número de pessoas, o mapa esquemático e a viagem de exemplo do sistema antigo são descartados.

## 2. Instalar no celular (PWA)
Abra o endereço publicado no celular:
- **Android (Chrome)**: menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari)**: botão Compartilhar → **Adicionar à Tela de Início**.

Depois da primeira abertura com internet, o app funciona **offline**: os dados, a última
cotação e as áreas do mapa já vistas ficam no aparelho. Para ter o mapa de Paris
offline, abra a aba Mapa com internet e passeie pelas regiões que vai visitar.

## 3. Passar os dados entre computador e celular
Os dados ficam **só no aparelho** (não há servidor). Para levar de um para outro:
1. No aparelho de origem: tela inicial → **Backup e dados** → **Exportar backup**.
   Isso baixa um arquivo `viagens-backup-AAAA-MM-DD-HHMM.json`.
2. Mande o arquivo para o outro aparelho (WhatsApp para você mesmo, e-mail, Drive…).
3. No outro aparelho: **Backup e dados** → **Importar backup** → escolha o arquivo.
4. Escolha:
   - **Mesclar**: junta os dois lados. Se o mesmo item foi editado nos dois, fica a versão mais recente.
     Itens excluídos continuam excluídos.
   - **Substituir tudo**: deixa o aparelho exatamente igual ao arquivo.

Exporte um backup de vez em quando como cópia de segurança. Limpar os dados do navegador apaga as viagens.

## 4. Publicar de graça

### Opção A — GitHub Pages (automático)
O repositório já tem o workflow `.github/workflows/deploy.yml`.
1. No GitHub, abra o repositório → **Settings** → **Pages** → em *Build and deployment*,
   escolha **Source: GitHub Actions**.
2. Junte este código na branch `main` (aprovando o Pull Request ou fazendo merge da branch).
3. Em **Actions**, aguarde o workflow "Publicar no GitHub Pages" ficar verde (~1–2 min).
4. O endereço aparece em Settings → Pages, no formato
   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Cada novo push na `main` publica a nova versão. O app no celular se atualiza sozinho
na próxima vez que for aberto com internet.

> O GitHub Pages gratuito exige repositório **público**. Os seus dados de viagem **não**
> vão para o repositório; eles ficam só nos aparelhos.

### Opção B — Netlify
1. Entre em <https://app.netlify.com> com sua conta do GitHub.
2. **Add new site → Import an existing project → GitHub** e escolha este repositório.
3. O Netlify lê o `netlify.toml` (build `npm run build`, pasta `dist`). Clique em **Deploy**.
4. Opcional: em *Site configuration → Change site name*, escolha um nome (ex.: `minhas-viagens.netlify.app`).

Funciona com repositório privado. Sem Git, também dá para rodar `npm run build` e
arrastar a pasta `dist` para <https://app.netlify.com/drop>.

## 5. Rodar no computador (desenvolvimento)
```bash
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes da lógica
npm run build    # gera a pasta dist/ para publicar
```

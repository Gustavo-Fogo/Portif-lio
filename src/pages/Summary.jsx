import { useState } from 'react';
import { useStore, go } from '../lib/store.jsx';
import { summarize } from '../lib/money.js';
import { fmtBRL, fmtMoney, fmtDate, fmtRate, fmtDateTime, todayISO, daysBetween } from '../lib/format.js';
import { HBarChart, StackBar } from '../components/Charts.jsx';
import { Card, Segmented, Badge } from '../components/ui.jsx';

export const STATUS_COLORS = { pago: '#1baf7a', a_pagar: '#eb6834', estimado: '#2a78d6' };

export default function Summary({ trip }) {
  const { rates } = useStore();
  const [settleMode, setSettleMode] = useState('real');
  const s = summarize(trip, rates, { settleStatuses: settleMode === 'real' ? ['pago', 'a_pagar'] : ['pago', 'a_pagar', 'estimado'] });
  const rateInfo = rates[trip.currency];
  const today = todayISO();
  const until = daysBetween(today, trip.startDate);

  return (
    <div className="stack-gap">
      {until > 0 && <p className="countdown">Faltam <strong>{until}</strong> dias para a viagem.</p>}
      {s.missingRate && (
        <div className="alert alert-warn">
          Sem cotação do {trip.currency}. Conecte-se à internet ou informe a cotação manualmente no Financeiro. Valores em {trip.currency} estão zerados no total em reais.
        </div>
      )}

      <div className="kpis">
        <div className="kpi kpi-main">
          <span className="kpi-label">Total geral</span>
          <strong className="kpi-value">{fmtBRL(s.byStatus.total)}</strong>
          <span className="small muted">{trip.participants.length > 1 ? `${fmtBRL(s.byStatus.total / trip.participants.length)} por pessoa (média)` : ''}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="dot" style={{ background: STATUS_COLORS.pago }} /> Pago</span>
          <strong className="kpi-value">{fmtBRL(s.byStatus.pago)}</strong>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="dot" style={{ background: STATUS_COLORS.a_pagar }} /> A pagar</span>
          <strong className="kpi-value">{fmtBRL(s.byStatus.a_pagar)}</strong>
        </div>
        <div className="kpi">
          <span className="kpi-label"><span className="dot" style={{ background: STATUS_COLORS.estimado }} /> Estimado (a gastar)</span>
          <strong className="kpi-value">{fmtBRL(s.byStatus.estimado)}</strong>
        </div>
      </div>

      {trip.currency !== 'BRL' && (
        <p className="small muted rate-line">
          Cotação usada: <strong>1 {trip.currency} = R$ {fmtRate(s.rate)}</strong>
          {trip.exchange.manualRate ? ' (manual)' : rateInfo ? ` · ${rateInfo.source} · ${fmtDateTime(rateInfo.quotedAt || rateInfo.fetchedAt)}` : ''} · cartão +
          {(Number(trip.exchange.spreadPct) + Number(trip.exchange.iofPct)).toLocaleString('pt-BR')}%
        </p>
      )}

      <Card title="Totais por moeda original">
        {Object.keys(s.byCurrency).length ? (
          <div className="table-wrap">
            <table className="table rtable">
              <thead>
                <tr><th>Moeda</th><th className="num">Pago</th><th className="num">A pagar</th><th className="num">Estimado</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {Object.entries(s.byCurrency).map(([cur, v]) => (
                  <tr key={cur}>
                    <td className="rt-head">{cur}</td>
                    <td className="num" data-label="Pago">{fmtMoney(v.pago, cur)}</td>
                    <td className="num" data-label="A pagar">{fmtMoney(v.a_pagar, cur)}</td>
                    <td className="num" data-label="Estimado">{fmtMoney(v.estimado, cur)}</td>
                    <td className="num" data-label="Total"><strong>{fmtMoney(v.total, cur)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyExpenses trip={trip} />
        )}
      </Card>

      <div className="grid-cards">
        <Card title="Por categoria (R$)">
          <HBarChart items={s.categories.map((c) => ({ label: c.name, value: c.total, color: c.color }))} />
        </Card>
        <Card title="Pago × pendente (R$)">
          <StackBar
            segments={[
              { label: 'Pago', value: s.byStatus.pago, color: STATUS_COLORS.pago },
              { label: 'A pagar', value: s.byStatus.a_pagar, color: STATUS_COLORS.a_pagar },
              { label: 'Estimado', value: s.byStatus.estimado, color: STATUS_COLORS.estimado },
            ]}
          />
        </Card>
      </div>

      <Card
        title="Por pessoa e acerto de contas"
        actions={<Segmented value={settleMode} onChange={setSettleMode} options={[['real', 'Pagos + a pagar'], ['todos', 'Incluir estimados']]} />}
      >
        <div className="table-wrap">
          <table className="table rtable">
            <thead>
              <tr><th>Pessoa</th><th className="num">Parte nos gastos</th><th className="num">Já pagou / vai pagar</th><th className="num">Saldo</th></tr>
            </thead>
            <tbody>
              {s.perPerson.map((p) => (
                <tr key={p.id}>
                  <td className="rt-head">{p.name}</td>
                  <td className="num" data-label="Parte nos gastos">
                    <span>
                      {fmtBRL(settleMode === 'real' ? p.share.pago + p.share.a_pagar : p.share.total)}
                      {settleMode === 'real' && p.share.estimado > 0 && <span className="small muted block">+ {fmtBRL(p.share.estimado)} estimado</span>}
                    </span>
                  </td>
                  <td className="num" data-label="Já pagou / vai pagar">{fmtBRL(p.paid)}</td>
                  <td data-label="Saldo" className={'num ' + (p.balance > 0.004 ? 'text-ok' : p.balance < -0.004 ? 'text-danger' : '')}>
                    <span>
                      {p.balance > 0.004 ? 'recebe ' : p.balance < -0.004 ? 'deve ' : ''}
                      {fmtBRL(Math.abs(p.balance))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>Quem deve para quem</h4>
        {s.settlement.length ? (
          <ul className="settle-list">
            {s.settlement.map((x, i) => (
              <li key={i}>
                <strong>{x.fromName}</strong> paga <strong className="money">{fmtBRL(x.amount)}</strong> para <strong>{x.toName}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Ninguém deve nada. Contas acertadas. ✅</p>
        )}
        <p className="small muted">
          Considera quem pagou cada gasto e a divisão escolhida. Valores em {trip.currency} convertidos para reais.
        </p>
      </Card>

      <Card title="Próximos vencimentos">
        {s.upcoming.length ? (
          <ul className="due-list">
            {s.upcoming.slice(0, 8).map((e) => {
              const d = e.dueDate ? daysBetween(today, e.dueDate) : null;
              return (
                <li key={e.id}>
                  <div>
                    <strong>{e.description}</strong>
                    <div className="small muted">{e.dueDate ? fmtDate(e.dueDate) : 'sem data de vencimento'}</div>
                  </div>
                  <div className="num">
                    <div>{fmtMoney(e.total, e.currency)}</div>
                    {d !== null && (d < 0 ? <Badge kind="danger">vencido há {-d} d</Badge> : d <= 7 ? <Badge kind="warn">{d === 0 ? 'hoje' : `em ${d} d`}</Badge> : <Badge>em {d} d</Badge>)}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Nada a pagar. 🎉</p>
        )}
      </Card>

      <Card title="Detax (restituição)">
        {s.detax.list.length ? (
          <>
            <p className="detax-total">
              Restituição possível: <strong>{fmtMoney(s.detax.refund, s.detax.currency)}</strong>
              <span className="muted"> ≈ {fmtBRL(s.detax.refundBRL)}</span>
            </p>
            <p className="small muted">
              {s.detax.ratePct}% sobre compras de pelo menos {fmtMoney(s.detax.min, s.detax.currency)} por loja no mesmo dia. Total marcado: {fmtMoney(s.detax.purchases, s.detax.currency)}.
            </p>
            <ul className="due-list">
              {s.detax.list.map((g, i) => (
                <li key={i}>
                  <div>
                    <strong>{g.vendor}</strong>
                    <div className="small muted">{g.day ? fmtDate(g.day) : 'sem dia'} · {g.items} {g.items === 1 ? 'item' : 'itens'}</div>
                  </div>
                  <div className="num">
                    <div>{fmtMoney(g.total, g.currency)}</div>
                    {g.eligible ? <Badge kind="ok">✓ {fmtMoney(g.refund, g.currency)}</Badge> : <Badge kind="warn">abaixo do mínimo</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">Nenhuma compra marcada com Detax.</p>
        )}
      </Card>
    </div>
  );
}

function EmptyExpenses({ trip }) {
  return (
    <div className="empty">
      <p>Nenhum gasto cadastrado ainda.</p>
      <div className="btn-row center">
        <button className="btn btn-primary" onClick={() => go(`/v/${trip.id}/financeiro`)}>Lançar gastos</button>
        <button className="btn" onClick={() => go(`/v/${trip.id}/importar`)}>Importar planilha</button>
      </div>
    </div>
  );
}

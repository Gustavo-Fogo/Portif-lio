// Gráficos simples em HTML/CSS (sem bibliotecas), com rótulos diretos e dica ao passar o dedo/mouse.
import { useState } from 'react';
import { fmtBRL } from '../lib/format.js';

/** Barras horizontais: magnitude por categoria. */
export function HBarChart({ items, format = fmtBRL, emptyText = 'Sem dados.' }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...items.map((i) => i.value), 0);
  if (!items.length || max <= 0) return <p className="muted">{emptyText}</p>;
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="hbar" role="table" aria-label="Gráfico por categoria">
      {items.map((i) => (
        <div
          key={i.label}
          className={'hbar-row' + (hover && hover !== i.label ? ' dim' : '')}
          role="row"
          onMouseEnter={() => setHover(i.label)}
          onMouseLeave={() => setHover(null)}
          onClick={() => setHover(hover === i.label ? null : i.label)}
          title={`${i.label}: ${format(i.value)} (${Math.round((i.value / total) * 100)}%)`}
        >
          <div className="hbar-label" role="cell">
            <span className="dot" style={{ background: i.color }} />
            {i.label}
          </div>
          <div className="hbar-track" role="cell">
            <div className="hbar-fill" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%`, background: i.color }} />
          </div>
          <div className="hbar-value" role="cell">
            {format(i.value)}
            <span className="muted small"> {Math.round((i.value / total) * 100)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barra empilhada única (parte de um todo) com legenda. */
export function StackBar({ segments, format = fmtBRL }) {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="muted">Sem dados.</p>;
  return (
    <div className="stack">
      <div className="stack-bar" role="img" aria-label={segments.map((s) => `${s.label}: ${format(s.value)}`).join('; ')}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              className={'stack-seg' + (hover && hover !== s.label ? ' dim' : '')}
              style={{ flexGrow: s.value, background: s.color }}
              title={`${s.label}: ${format(s.value)} (${Math.round((s.value / total) * 100)}%)`}
              onMouseEnter={() => setHover(s.label)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
      </div>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.label} onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}>
            <span className="dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{format(s.value)}</strong>
            <span className="muted small">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

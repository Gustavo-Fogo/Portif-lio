// Visualização dos trajetos: selos das linhas, resumo em uma linha e passo a passo
import { kindInfo, isTransit, lineStyle, routeMinutes, fmtMinutes } from '../lib/transit.js';

export function LineBadge({ kind, line, size = 'md' }) {
  if (!isTransit(kind)) {
    return <span className={`lb lb-icon lb-${size}`} aria-label={kindInfo(kind).label}>{kindInfo(kind).icon}</span>;
  }
  const st = lineStyle(kind, line);
  const prefix = kind === 'rer' ? 'RER' : kind === 'metro' ? 'M' : kind === 'tram' ? 'T' : kind === 'bus' ? 'Bus' : '';
  return (
    <span className={`lb lb-${kind} lb-${size}`} style={{ background: st.background, color: st.color }} aria-label={`${kindInfo(kind).label} ${st.label}`}>
      {kind === 'funicular' ? '🚡' : <><small>{prefix}</small>{st.label}</>}
    </span>
  );
}

/** Resumo compacto: 🚶 8 › RER B › M1 · 45 min */
export function RouteSummary({ transfer }) {
  const steps = transfer?.steps || [];
  const total = routeMinutes(transfer);
  if (!steps.length) {
    return (
      <span className="rs">
        {[transfer?.mode, transfer?.line && `linha ${transfer.line}`, transfer?.duration].filter(Boolean).join(' · ')}
      </span>
    );
  }
  return (
    <span className="rs">
      {steps.map((s, i) => (
        <span key={i} className="rs-item">
          {i > 0 && <span className="rs-sep" aria-hidden="true">›</span>}
          <LineBadge kind={s.kind} line={s.line} size="sm" />
          {!isTransit(s.kind) && s.min ? <span className="rs-min">{s.min}′</span> : null}
        </span>
      ))}
      {total > 0 && steps.length > 1 && <span className="rs-total">· {transfer.duration || fmtMinutes(total)}</span>}
    </span>
  );
}

/** Passo a passo: onde embarcar, sentido, onde descer. */
export function RouteSteps({ transfer }) {
  const steps = transfer?.steps || [];
  if (!steps.length) return null;
  return (
    <ol className="steps-tl">
      {steps.map((s, i) => {
        const transit = isTransit(s.kind);
        const st = transit ? lineStyle(s.kind, s.line) : null;
        return (
          <li key={i} className={'st ' + (transit ? 'st-transit' : 'st-plain')}>
            <div className="st-rail" style={transit ? { background: st.background } : undefined} aria-hidden="true" />
            <div className="st-badge"><LineBadge kind={s.kind} line={s.line} /></div>
            <div className="st-body">
              {transit ? (
                <>
                  <div className="st-line">
                    <span className="st-k">Embarque</span> <strong>{s.from || '—'}</strong>
                  </div>
                  {s.direction && (
                    <div className="st-line st-dir">
                      <span className="st-k">Sentido</span> <strong>{s.direction}</strong>
                    </div>
                  )}
                  <div className="st-line">
                    <span className="st-k">Desça em</span> <strong>{s.to || '—'}</strong>
                    {(s.stops || s.min) && (
                      <span className="st-meta">
                        {s.stops ? ` · ${s.stops} ${Number(s.stops) === 1 ? 'parada' : 'paradas'}` : ''}
                        {s.min ? ` · ${s.min} min` : ''}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="st-line">
                  <strong>{kindInfo(s.kind).label}</strong>
                  {s.min ? <span className="st-meta"> · {s.min} min</span> : null}
                  {(s.to || s.from) && (
                    <span>
                      {' '}
                      {s.from ? `de ${s.from} ` : ''}
                      {s.to ? `até ${s.to}` : ''}
                    </span>
                  )}
                </div>
              )}
              {s.note && <div className="st-note">{s.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

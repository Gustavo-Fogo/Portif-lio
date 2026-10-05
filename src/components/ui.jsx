import { useEffect, useState } from 'react';
import { parseNumber } from '../lib/parse.js';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '', group }) {
  // Controles compostos (vários botões) não podem ficar dentro de <label>.
  const isGroup = group || [Segmented, Chips].includes(children?.type);
  const Tag = isGroup ? 'div' : 'label';
  return (
    <Tag className={'field ' + className} role={isGroup ? 'group' : undefined} aria-label={isGroup ? label : undefined}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  );
}

/** Campo numérico que aceita vírgula (1.234,56). */
export function NumberInput({ value, onChange, placeholder, allowEmpty, ...rest }) {
  const toText = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    const n = parseNumber(text);
    if (!(n === Number(value) || (text === '' && (value === null || value === '')))) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (e.target.value.trim() === '') onChange(allowEmpty ? null : 0);
        else if (!isNaN(n)) onChange(n);
      }}
      {...rest}
    />
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, selected, onToggle }) {
  return (
    <div className="chips">
      {options.map(([v, label, color]) => (
        <button
          type="button"
          key={v}
          className={'chip' + (selected.includes(v) ? ' on' : '')}
          aria-pressed={selected.includes(v)}
          onClick={() => onToggle(v)}
          style={color && selected.includes(v) ? { borderColor: color, boxShadow: `inset 4px 0 0 ${color}` } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ kind = 'neutral', children }) {
  return <span className={'badge badge-' + kind}>{children}</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

let toastSetter = null;
export function toast(msg, kind = 'ok') {
  toastSetter?.({ msg, kind, id: Date.now() });
}
export function Toaster() {
  const [t, setT] = useState(null);
  toastSetter = setT;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 3500);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div className={'toast toast-' + t.kind} role="status" onClick={() => setT(null)}>
      {t.msg}
    </div>
  );
}

export function readFileAs(file, as = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (as === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsText(file, 'utf-8');
  });
}

import type { ReactNode } from 'react';
import type { Ctx } from './ctx';
export function Empty({ ctx, what }: { ctx: Ctx; what: string }) {
  return (
    <section className="card empty">
      <div className="emptyart" aria-hidden>
        <svg viewBox="0 0 120 80"><path d="M6 20c30 0 34 22 60 22h48M6 42h60M6 64c30 0 34-22 60-22" fill="none" stroke="#99f6e4" strokeWidth="9" strokeLinecap="round" /><circle cx="100" cy="42" r="12" fill="#10b981" /></svg>
      </div>
      <h2>No holdings yet</h2>
      <p>Add your dividend stocks and funds to see {what}.</p>
      <div className="btnrow">
        <button className="primary" onClick={() => ctx.go('holdings')}>Add holdings</button>
        <button className="ghost" onClick={() => ctx.setSample(true)}>Try the sample portfolio</button>
      </div>
    </section>
  );
}
export function Sheet({ title, onClose, children, eyebrow }: { title: ReactNode; onClose: () => void; children: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog">
        <div className="grab" />
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
export const Kpi = ({ k, v, s, tone }: { k: string; v: ReactNode; s?: ReactNode; tone?: string }) => (
  <div className={'kpi' + (tone ? ' ' + tone : '')}><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
);
export const Est = () => <span className="est" title="Estimated from payment history">est.</span>;
export function sourceLine(ctx: Ctx) {
  const d = ctx.index?.tickers[0]?.priceDate;
  return `Prices & dividend history: Yahoo Finance (as of ${d ?? '—'}); payment dates: Nasdaq where published, otherwise estimated (est.)`;
}

// Small dependency-free SVG bar charts.
import { useEffect, useRef, useState } from 'react';
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(340);
  useEffect(() => { const ro = new ResizeObserver(e => setW(Math.max(260, Math.round(e[0].contentRect.width)))); if (ref.current) ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
const nice = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
const short = (v: number) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${+(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k` : `$${Math.round(v)}`);

export type Bar = { key: string; label: string; parts: { v: number; color: string; hatch?: boolean }[]; sub?: string };
export function BarChart({ bars, height = 210, avg, selected, onPick, avgLabel = 'avg' }: { bars: Bar[]; height?: number; avg?: number; selected?: string | null; onPick?: (k: string) => void; avgLabel?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const max = nice(Math.max(1, ...bars.map(b => b.parts.reduce((s, p) => s + p.v, 0)), avg ?? 0));
  const padL = 40, padB = 26, padT = 10, iw = w - padL - 6, ih = height - padB - padT;
  const bw = iw / bars.length, gap = Math.min(10, bw * 0.28);
  const y = (v: number) => padT + ih - (v / max) * ih;
  return (
    <div ref={ref} className="barwrap">
      <svg width={w} height={height} role="img" aria-label="Bar chart">
        <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" fillOpacity="0.0" /><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2.2" strokeOpacity="0.55" /></pattern></defs>
        {[0, 0.5, 1].map(f => <g key={f}><line x1={padL} x2={w - 4} y1={y(max * f)} y2={y(max * f)} stroke="#e3efec" /><text x={padL - 6} y={y(max * f) + 4} textAnchor="end" className="ax">{short(max * f)}</text></g>)}
        {bars.map((b, i) => {
          let acc = 0; const x = padL + i * bw + gap / 2;
          const on = !selected || selected === b.key;
          return (
            <g key={b.key} onClick={() => onPick?.(b.key)} className="bar" opacity={on ? 1 : 0.45}>
              <rect x={padL + i * bw} y={padT} width={bw} height={ih + padB} fill="transparent" />
              {b.parts.map((p, j) => { const y0 = y(acc), y1 = y(acc + p.v); acc += p.v; const hh = Math.max(0, y0 - y1); return hh > 0 ? <g key={j}><rect x={x} y={y1} width={bw - gap} height={hh} rx={Math.min(5, (bw - gap) / 3)} fill={p.color} />{p.hatch && <rect x={x} y={y1} width={bw - gap} height={hh} rx={Math.min(5, (bw - gap) / 3)} fill="url(#hatch)" />}</g> : null; })}
              <text x={x + (bw - gap) / 2} y={height - 8} textAnchor="middle" className={'ax' + (selected === b.key ? ' axon' : '')}>{b.label}</text>
            </g>
          );
        })}
        {avg != null && avg > 0 && <g><line x1={padL} x2={w - 4} y1={y(avg)} y2={y(avg)} stroke="#0f766e" strokeDasharray="4 4" strokeWidth={1.4} /><text x={w - 6} y={y(avg) - 5} textAnchor="end" className="ax avg">{avgLabel} {short(avg)}</text></g>}
      </svg>
    </div>
  );
}

/** Snowball chart: income bars (left axis) + portfolio value line (right axis). */
export function ComboChart({ data, height = 240 }: { data: { x: number; bar: number; line: number }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const padL = 44, padR = 48, padB = 24, padT = 12, iw = w - padL - padR, ih = height - padB - padT;
  const mb = nice(Math.max(1, ...data.map(d => d.bar))), ml = nice(Math.max(1, ...data.map(d => d.line)));
  const bw = iw / data.length, gap = Math.max(1, Math.min(8, bw * 0.3));
  const yb = (v: number) => padT + ih - (v / mb) * ih, yl = (v: number) => padT + ih - (v / ml) * ih;
  const xc = (i: number) => padL + i * bw + bw / 2;
  const step = Math.ceil(data.length / 10);
  return (
    <div ref={ref} className="barwrap">
      <svg width={w} height={height} role="img" aria-label="Projected income and portfolio value">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={padL} x2={w - padR} y1={yb(mb * f)} y2={yb(mb * f)} stroke="#e3efec" />
          <text x={padL - 6} y={yb(mb * f) + 4} textAnchor="end" className="ax" fill="#059669">{short(mb * f)}</text>
          <text x={w - padR + 6} y={yl(ml * f) + 4} className="ax">{short(ml * f)}</text></g>)}
        {data.map((d, i) => <rect key={i} x={padL + i * bw + gap / 2} y={yb(d.bar)} width={bw - gap} height={Math.max(0, padT + ih - yb(d.bar))} rx={Math.min(4, (bw - gap) / 3)} fill="#10b981" />)}
        <path d={data.map((d, i) => `${i ? 'L' : 'M'}${xc(i)},${yl(d.line)}`).join('')} fill="none" stroke="#0f2f2b" strokeWidth={2.2} strokeLinejoin="round" />
        {data.map((d, i) => (i % step === 0 || i === data.length - 1) && <text key={i} x={xc(i)} y={height - 7} textAnchor="middle" className="ax">{d.x === 0 ? 'Now' : `Y${d.x}`}</text>)}
      </svg>
    </div>
  );
}

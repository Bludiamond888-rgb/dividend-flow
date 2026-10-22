import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey, type SankeyLink, type SankeyNode } from 'd3-sankey';
import { money } from '../lib/format';

export type FNode = { id: string; label: string; value: number; kind: 'holding' | 'total' | 'drip' | 'cash' | 'other'; color: string };
export type FLink = { source: string; target: string; value: number; color: string };
type N = SankeyNode<FNode, FLink>; type L = SankeyLink<FNode, FLink>;
export const PALETTE = ['#0f766e', '#0d9488', '#14b8a6', '#059669', '#10b981', '#34d399', '#0891b2', '#06b6d4', '#65a30d', '#84cc16', '#0e7490', '#16a34a', '#2dd4bf', '#4d7c0f'];
export const C = { total: '#134e4a', drip: '#059669', cash: '#d97706', other: '#94a3b8' };

export function FlowChart({ nodes, links, total, selected, onPick }: { nodes: FNode[]; links: FLink[]; total: number; selected: string | null; onPick: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const ro = new ResizeObserver(e => setW(Math.max(280, Math.round(e[0].contentRect.width))));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const compact = w < 560;
  const nLeft = nodes.filter(n => n.kind === 'holding' || n.kind === 'other').length;
  const H = Math.max(nLeft <= 1 ? 200 : compact ? 280 : 320, Math.min(780, nLeft * (compact ? 40 : 44) + 50));
  const padL = compact ? 78 : 120, padR = compact ? 92 : 150;
  const layout = useMemo(() => {
    const gen = sankey<FNode, FLink>().nodeId(d => d.id).nodeWidth(compact ? 10 : 14).nodePadding(compact ? 10 : 14)
      .nodeSort((a, b) => (a.kind === 'other' ? 1 : 0) - (b.kind === 'other' ? 1 : 0) || b.value - a.value)
      .extent([[padL, 30], [w - padR, H - 10]]);
    return gen({ nodes: nodes.map(n => ({ ...n })), links: links.map(l => ({ ...l })) });
  }, [nodes, links, w, H, compact, padL, padR]);
  const ribbon = (l: L) => {
    const s = l.source as N, t = l.target as N, wd = Math.max(1, l.width!);
    const a0 = s.x1!, a1 = t.x0!, am = (a0 + a1) / 2, b0 = l.y0! - wd / 2, b1 = l.y1! - wd / 2;
    return `M${a0},${b0}C${am},${b0} ${am},${b1} ${a1},${b1}L${a1},${b1 + wd}C${am},${b1 + wd} ${am},${b0 + wd} ${a0},${b0 + wd}Z`;
  };
  // keep left/right labels from overlapping: push apart to a minimum spacing, then pull back inside the box
  const labelY = useMemo(() => {
    const m: Record<string, number> = {}; const gap = compact ? 25 : 28;
    for (const side of [true, false]) {
      const ns = layout.nodes.filter(n => n.kind !== 'total' && ((n.kind === 'holding' || n.kind === 'other') === side)).sort((a, b) => a.y0! - b.y0!);
      const ys = ns.map(n => (n.y0! + n.y1!) / 2);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
      const over = (ys.at(-1) ?? 0) - (H - 12); if (over > 0) for (let i = ys.length - 1; i >= 0; i--) { ys[i] -= over; if (i && ys[i - 1] <= ys[i] - gap) break; if (i) ys[i - 1] = Math.min(ys[i - 1], ys[i] - gap); }
      ns.forEach((n, i) => (m[n.id] = Math.max(gap / 2, ys[i])));
    }
    return m;
  }, [layout, H, compact]);
  const dim = (ids: string[]) => selected && !ids.includes(selected);
  return (
    <div ref={wrap} className="chartwrap">
      <svg width={w} height={H} role="img" aria-label="Dividend flow chart">
        <defs>
          {layout.links.map((l, i) => { const s = l.source as N, t = l.target as N; return (
            <linearGradient key={i} id={`g${i}`} gradientUnits="userSpaceOnUse" x1={s.x1} x2={t.x0}>
              <stop offset="0%" stopColor={s.color} stopOpacity={0.32} /><stop offset="100%" stopColor={t.color} stopOpacity={0.32} />
            </linearGradient>); })}
        </defs>
        {layout.links.map((l, i) => { const s = l.source as N, t = l.target as N; return (
          <path key={i} d={ribbon(l)} fill={`url(#g${i})`} className="ribbon" opacity={dim([s.id, t.id]) ? 0.35 : 1} onClick={() => onPick(s.kind === 'total' ? t.id : s.id)} />); })}
        {layout.nodes.map(n => {
          const x0 = n.x0!, x1 = n.x1!, y0 = n.y0!, y1 = n.y1!, h = Math.max(2, y1 - y0);
          const left = n.kind === 'holding' || n.kind === 'other';
          const mid = labelY[n.id] ?? (y0 + y1) / 2;
          const share = total ? Math.round((n.value / total) * 100) : 0;
          const tx = left ? x0 - 6 : x1 + 6;
          const big = n.kind === 'total';
          return (
            <g key={n.id} className={'node' + (selected === n.id ? ' sel' : '')} onClick={() => onPick(n.id)} opacity={dim([n.id]) && !big ? 0.55 : 1}>
              <rect x={x0 - 12} y={y0 - 3} width={x1 - x0 + 24} height={h + 6} fill="transparent" />
              <rect x={x0} y={y0} width={x1 - x0} height={h} rx={3} fill={n.color} />
              {big ? (
                <text x={(x0 + x1) / 2} y={y0 - 10} textAnchor="middle" className="lbl">
                  <tspan className="l2" fill="#134e4a">{money(n.value, false)}/yr</tspan>
                </text>
              ) : (
                <text x={tx} y={mid} textAnchor={left ? 'end' : 'start'} className="lbl" dominantBaseline="middle">
                  <tspan x={tx} dy={left ? '-0.15em' : '-0.55em'} className="l1" fill="#0f2f2b">{n.label}</tspan>
                  <tspan x={tx} dy="1.2em" className="l3" fill="#5b746f">{money(n.value, n.value < 1000)}{left ? '' : ` · ${share}%`}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { settings } from '../lib/data';
import { pct } from '../lib/format';
import type { Ctx } from './ctx';
import { Empty } from './common';

export function YieldScreen({ ctx }: { ctx: Ctx }) {
  const cpi = ctx.index?.cpi ?? null;
  const [margin, setMargin] = useState(settings.margin);
  const m = parseFloat(margin) / 100;
  const marginOk = isFinite(m) && m > 0 && m < 0.5;
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return ctx.pf.rows.filter(r => !seen.has(r.h.ticker) && seen.add(r.h.ticker)).sort((a, b) => (b.yieldPct ?? -1) - (a.yieldPct ?? -1));
  }, [ctx.pf]);
  if (!ctx.portfolio.length) return <Empty ctx={ctx} what="how your yields compare with inflation" />;
  const max = Math.max(0.04, ...rows.map(r => r.yieldPct ?? 0), cpi?.yoy ?? 0, marginOk ? m : 0) * 1.08;
  const below = rows.filter(r => r.yieldPct != null && cpi && r.yieldPct < cpi.yoy);
  return (
    <>
      <section className="card refs">
        <div className="ref">
          <div className="k"><i className="cpi" />Inflation (CPI-U, 12-mo)</div>
          <div className="v">{cpi ? pct(cpi.yoy) : '—'}</div>
          <div className="s">{cpi ? `${cpi.period} · BLS, fetched ${cpi.fetched.slice(0, 10)}` : 'not available'}</div>
        </div>
        <div className="ref">
          <div className="k"><i className="mgn" />Schwab margin rate</div>
          <div className="mrow"><input aria-label="Schwab margin rate percent" inputMode="decimal" placeholder="enter %" value={margin} onChange={e => { setMargin(e.target.value); settings.margin = e.target.value; }} /><span>%</span></div>
          <div className="s">{marginOk ? 'your entry (stored on this device)' : 'Enter Schwab’s current first-tier rate (schwab.com/margin). No free source to fetch it.'}</div>
        </div>
      </section>
      {cpi && <div className={'card ' + (below.length ? 'warnsoft' : 'goodsoft')}>
        {below.length ? <><b>{below.length} holding{below.length > 1 ? 's' : ''} yield less than inflation</b> ({below.map(r => r.h.ticker).join(', ')}). Their income alone loses purchasing power unless the dividend or price grows.</> : <>Every holding with a dividend yields more than inflation ({pct(cpi.yoy)}).</>}
      </div>}
      <section className="card">
        <div className="cardhead"><h2>Yield by holding</h2></div>
        <div className="ybars">
          {rows.map(r => {
            const y = r.yieldPct;
            const tone = y == null ? 'none' : cpi && y < cpi.yoy ? 'low' : marginOk && y < m ? 'mid' : 'high';
            return (
              <div key={r.h.ticker} className="yrow">
                <div className="yl"><b>{r.h.ticker}</b>{cpi && y != null && y < cpi.yoy && <span className="flag">below inflation</span>}</div>
                <div className="ytrack">
                  {y != null && <div className={'yfill ' + tone} style={{ width: `${(y / max) * 100}%` }} />}
                  {cpi && <div className="vline cpi" style={{ left: `${(cpi.yoy / max) * 100}%` }} />}
                  {marginOk && <div className="vline mgn" style={{ left: `${(m / max) * 100}%` }} />}
                </div>
                <div className="yv">{y == null ? 'no data' : pct(y)}</div>
              </div>
            );
          })}
        </div>
        <div className="legend"><span><i className="dash cpi" />Inflation {cpi ? pct(cpi.yoy, 1) : ''}</span>{marginOk && <span><i className="dash mgn" />Margin {pct(m, 2)}</span>}</div>
      </section>
      <section className="card">
        <table className="items"><thead><tr><th>Holding</th><th className="n">Yield</th><th className="n">− CPI</th><th className="n">− margin</th><th className="n">On cost</th></tr></thead><tbody>
          {rows.map(r => <tr key={r.h.ticker}><td><b>{r.h.ticker}</b></td><td className="n">{pct(r.yieldPct)}</td>
            <td className={'n ' + (r.yieldPct != null && cpi ? (r.yieldPct >= cpi.yoy ? 'up' : 'down') : '')}>{r.yieldPct != null && cpi ? `${r.yieldPct >= cpi.yoy ? '+' : '−'}${Math.abs((r.yieldPct - cpi.yoy) * 100).toFixed(2)}` : '—'}</td>
            <td className={'n ' + (r.yieldPct != null && marginOk ? (r.yieldPct >= m ? 'up' : 'down') : '')}>{r.yieldPct != null && marginOk ? `${r.yieldPct >= m ? '+' : '−'}${Math.abs((r.yieldPct - m) * 100).toFixed(2)}` : '—'}</td>
            <td className="n m">{pct(r.yoc)}</td></tr>)}
        </tbody></table>
        <p className="fine">Differences in percentage points. Yield = next-12-month dividends per share ÷ latest price. A yield below the margin rate means borrowing on margin to buy that holding costs more than it pays.</p>
        {cpi && <p className="fine">CPI: {cpi.series}, {cpi.period} index {cpi.index} vs {cpi.indexYearAgo} a year earlier. Source: {cpi.source}, refreshed weekly at build time.</p>}
      </section>
    </>
  );
}

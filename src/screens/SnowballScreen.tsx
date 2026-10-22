import { useEffect, useMemo, useState } from 'react';
import { ComboChart } from '../components/Bars';
import { snowball } from '../lib/snowball';
import { money, pct } from '../lib/format';
import type { Ctx } from './ctx';
import { Kpi } from './common';

type S = { monthly: string; years: number; dg: string; pg: string; drip: boolean; startV: string; startY: string };
const DEF: S = { monthly: '500', years: 10, dg: '5', pg: '4', drip: true, startV: '', startY: '' };
const n = (s: string) => { const v = parseFloat(s.replace(/[$,%\s]/g, '')); return isFinite(v) ? v : NaN; };
export function SnowballScreen({ ctx }: { ctx: Ctx }) {
  const [s, setS] = useState<S>(() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem('df.snow') || '{}') }; } catch { return DEF; } });
  useEffect(() => { localStorage.setItem('df.snow', JSON.stringify(s)); }, [s]);
  const has = ctx.pf.value > 0 && ctx.pf.total > 0;
  const startValue = has ? ctx.pf.value : n(s.startV) || 0;
  const startYield = has ? ctx.pf.total / ctx.pf.value : n(s.startY) / 100;
  const ok = startValue > 0 ? isFinite(startYield) && startYield > 0 : isFinite(startYield) && startYield > 0 && n(s.monthly) > 0;
  const res = useMemo(() => ok ? snowball({
    startValue: startValue || 0.000001, startIncome: (startValue || 0.000001) * startYield, monthly: n(s.monthly) || 0, years: s.years,
    divGrowth: (n(s.dg) || 0) / 100, priceGrowth: (n(s.pg) || 0) / 100, drip: s.drip,
  }) : null, [ok, startValue, startYield, s]);
  const last = res?.at(-1);
  const set = (p: Partial<S>) => setS(v => ({ ...v, ...p }));
  return (
    <>
      <section className="card proj-banner">Projection only: built entirely on the assumptions below, not a forecast. Real dividends and prices can fall.</section>
      <section className="card form">
        {!has && <div className="grid2">
          <label className="field">Starting amount ($)<input inputMode="decimal" value={s.startV} onChange={e => set({ startV: e.target.value })} placeholder="0" /></label>
          <label className="field">Starting yield (%)<input inputMode="decimal" value={s.startY} onChange={e => set({ startY: e.target.value })} placeholder="e.g. your target" /><small>No holdings with prices yet, so enter the yield you expect.</small></label>
        </div>}
        {has && <p className="fine">Starts from your portfolio: {money(ctx.pf.value, false)} value, {money(ctx.pf.total)}/yr income ({pct(startYield)} yield). New money is assumed to earn the same yield.</p>}
        <label className="field">Monthly contribution ($)<input inputMode="decimal" value={s.monthly} onChange={e => set({ monthly: e.target.value })} /></label>
        <div className="field">Years
          <div className="seg full">{[5, 10, 20, 30].map(y => <button key={y} className={s.years === y ? 'on' : ''} onClick={() => set({ years: y })}>{y}</button>)}</div>
        </div>
        <div className="grid2">
          <label className="field">Dividend growth (%/yr)<input inputMode="decimal" value={s.dg} onChange={e => set({ dg: e.target.value })} /></label>
          <label className="field">Price growth (%/yr)<input inputMode="decimal" value={s.pg} onChange={e => set({ pg: e.target.value })} /></label>
        </div>
        <label className="switch"><input type="checkbox" checked={s.drip} onChange={e => set({ drip: e.target.checked })} /><span className="knob" /> Reinvest dividends (DRIP)</label>
      </section>
      {res && last ? <>
        <section className="kpis card">
          <Kpi k={`Income in year ${s.years}`} v={money(last.income, false)} s={`${money(last.income / 12, false)}/mo · projected`} tone="hero" />
          <Kpi k="Portfolio value" v={money(last.value, false)} s="projected" />
          <Kpi k="You contribute" v={money(last.contributed, false)} s="incl. starting value" />
          <Kpi k={s.drip ? 'Dividends reinvested' : 'Cash collected'} v={money(s.drip ? res.slice(1).reduce((a, y) => a + y.income, 0) : last.cashCollected, false)} s={`over ${s.years} years`} />
        </section>
        <section className="card chartcard">
          <div className="cardhead"><h2>Projected annual income and value</h2></div>
          <ComboChart data={res.map(y => ({ x: y.year, bar: y.income, line: y.value }))} />
          <div className="legend"><span><i style={{ background: '#10b981' }} />Annual dividend income (left)</span><span><i className="line" />Portfolio value (right)</span></div>
          <p className="source">Projection on your assumptions: {money(n(s.monthly) || 0, false)}/mo, dividends +{n(s.dg) || 0}%/yr, prices +{n(s.pg) || 0}%/yr, DRIP {s.drip ? 'on' : 'off'}. Monthly compounding; ignores taxes, fees and dividend cuts.</p>
        </section>
        <section className="card">
          <table className="items"><thead><tr><th>Year</th><th className="n">Income</th><th className="n">Value</th><th className="n">Yield</th></tr></thead><tbody>
            {res.filter(y => y.year === 0 || y.year % (s.years > 10 ? 5 : 1) === 0 || y.year === s.years).map(y => (
              <tr key={y.year}><td>{y.year === 0 ? 'Now' : `Year ${y.year}`}</td><td className="n"><b>{money(y.income, false)}</b></td><td className="n">{money(y.value, false)}</td><td className="n m">{pct(y.yieldOnValue)}</td></tr>))}
          </tbody></table>
        </section>
      </> : <section className="card note">Enter a starting amount and yield (or add holdings) to see a projection.</section>}
    </>
  );
}

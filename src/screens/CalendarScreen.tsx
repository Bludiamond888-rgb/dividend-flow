import { useMemo, useState } from 'react';
import { BarChart } from '../components/Bars';
import { calendar } from '../lib/income';
import { dateLong, dateShort, dps, money, monShort } from '../lib/format';
import type { Ctx } from './ctx';
import { Empty, Est, Kpi, sourceLine } from './common';

export function CalendarScreen({ ctx }: { ctx: Ctx }) {
  const payments = useMemo(() => ctx.pf.rows.flatMap(r => r.proj.payments), [ctx.pf]);
  const cal = useMemo(() => calendar(payments, ctx.today), [payments, ctx.today]);
  const [sel, setSel] = useState<string | null>(null);
  if (!ctx.portfolio.length) return <Empty ctx={ctx} what="your month-by-month dividend calendar" />;
  const months = sel ? cal.months.filter(m => m.key === sel) : cal.months;
  const best = cal.months.reduce((a, b) => (b.total > a.total ? b : a), cal.months[0]);
  const low = cal.months.reduce((a, b) => (b.total < a.total ? b : a), cal.months[0]);
  return (
    <>
      <div className="pair">
      <section className="card nextpay">
        {cal.next ? <>
          <div className="eyebrow">NEXT PAYDAY</div>
          <div className="count"><b>{cal.nextDays === 0 ? 'Today' : cal.nextDays === 1 ? 'Tomorrow' : `${cal.nextDays} days`}</b><span>{dateLong(cal.next.pay)}{cal.nextGroup.some(p => p.est) && <> <Est /></>}</span></div>
          <div className="nextlist">{cal.nextGroup.map(p => <span key={p.holdingId} className="chip">{p.ticker} {money(p.amount)}</span>)}</div>
        </> : <><div className="eyebrow">NEXT PAYDAY</div><p className="fine">No expected payments in the next 12 months.</p></>}
      </section>
      <section className="kpis card">
        <Kpi k="Monthly average" v={money(cal.monthlyAvg)} s="next 12 months" tone="hero" />
        <Kpi k="Next 12 months" v={money(cal.total)} s={`${payments.length} payments`} />
        <Kpi k="Biggest month" v={best.total ? `${monShort(best.m)} ${money(best.total, false)}` : '—'} />
        <Kpi k="Lightest month" v={cal.total ? `${monShort(low.m)} ${money(low.total, false)}` : '—'} />
      </section>
      </div>
      <section className="card chartcard">
        <div className="cardhead"><h2>Expected payments by month</h2>{sel && <a className="meta" onClick={() => setSel(null)}>Show all months</a>}</div>
        <BarChart bars={cal.months.map(m => {
          const conf = m.items.filter(p => !p.est).reduce((s, p) => s + p.amount, 0);
          return { key: m.key, label: monShort(m.m).slice(0, 3), parts: [{ v: conf, color: '#0f766e' }, { v: m.total - conf, color: '#2dd4bf', hatch: true }] };
        })} avg={cal.monthlyAvg} selected={sel} onPick={k => setSel(k === sel ? null : k)} />
        <div className="legend"><span><i style={{ background: '#0f766e' }} />Pay date published</span><span><i className="hatch" style={{ background: '#2dd4bf' }} />Estimated (est.)</span><span><i className="dash" />Monthly average</span></div>
        <p className="source">{sourceLine(ctx)}. Covers the next 12 months from today (the current month also includes early next-year payments in that month). Future payments repeat each holding's last year of payments; estimated pay dates use the typical ex-date-to-pay-date gap.</p>
      </section>
      {months.map(m => (
        <section key={m.key} className="card month">
          <div className="cardhead"><h2>{monShort(m.m)} {m.years.length > 1 ? m.years.join(' / ') : m.years[0] ?? m.y}</h2><b className="mtotal">{money(m.total)}</b></div>
          {m.items.length ? <table className="items"><tbody>
            {m.items.map((p, i) => (
              <tr key={i}>
                <td className="d">{dateShort(p.pay)}{m.years.length > 1 ? ` ’${p.pay.slice(2, 4)}` : ''}{p.est && <> <Est /></>}</td>
                <td><b>{p.ticker}</b>{p.drip && <span className="tag drip">DRIP</span>}{p.status === 'manual' && <span className="tag">manual</span>}</td>
                <td className="n m">{dps(p.perShare)}/sh</td>
                <td className="n"><b>{money(p.amount)}</b></td>
              </tr>))}
          </tbody></table> : <p className="fine">No payments expected.</p>}
        </section>
      ))}
    </>
  );
}

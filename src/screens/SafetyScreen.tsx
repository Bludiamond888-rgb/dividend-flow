import { useMemo, useState } from 'react';
import { payoutSafety, type Ratio, type Safety } from '../lib/safety';
import { money, pct } from '../lib/format';
import type { Ctx } from './ctx';
import { Empty } from './common';

const LABEL = { green: 'Safe', amber: 'Watch', red: 'At risk', na: 'n/a' } as const;
const ORDER = { red: 0, amber: 1, green: 2, na: 3 } as const;
export function SafetyScreen({ ctx }: { ctx: Ctx }) {
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return ctx.portfolio.filter(h => !seen.has(h.ticker) && seen.add(h.ticker)).map(h => {
      const t = ctx.data[h.ticker];
      const s: Safety = t ? payoutSafety(t.sec, { type: t.type, name: t.name, divs: t.divs }) : payoutSafety(null, { type: 'stock', name: h.ticker });
      return { h, t, s };
    }).sort((a, b) => ORDER[a.s.badge] - ORDER[b.s.badge] || a.h.ticker.localeCompare(b.h.ticker));
  }, [ctx.portfolio, ctx.data]);
  const [open, setOpen] = useState<string | null>(null);
  if (!ctx.portfolio.length) return <Empty ctx={ctx} what="how well each dividend is covered" />;
  const counts = { green: 0, amber: 0, red: 0, na: 0 }; rows.forEach(r => counts[r.s.badge]++);
  return (
    <>
      <section className="card summary">
        <div className="badges">
          <span className="b green">{counts.green} safe</span><span className="b amber">{counts.amber} watch</span><span className="b red">{counts.red} at risk</span><span className="b na">{counts.na} n/a</span>
        </div>
        <p className="fine">Payout ratio = dividends paid ÷ net income, and ÷ free cash flow (operating cash flow − capital spending), summed over the last 3 fiscal years from SEC 10-K filings. Green: both under 75% and the dividend grew. Amber: 75–100%, one measure over 100%, or no raise. Red: both over 100%, negative earnings or cash flow, or a dividend cut.</p>
      </section>
      {rows.map(({ h, t, s }) => (
        <section key={h.ticker} className={'card safety ' + s.badge} onClick={() => setOpen(open === h.ticker ? null : h.ticker)}>
          <div className="srow">
            <div><b className="tk">{h.ticker}</b><div className="nm">{t?.name ?? 'No bundled data'}</div></div>
            <span className={'badge ' + s.badge}>{s.badge === 'na' && s.kind === 'fund' ? 'n/a (fund)' : LABEL[s.badge]}</span>
          </div>
          {s.kind !== 'fund' && s.fy && <div className="ratios">
            <RatioCell k="vs earnings" r={s.earn3.value != null ? s.earn3 : s.earn} hide={s.kind === 'reit'} />
            <RatioCell k="vs free cash flow" r={s.fcf3.value != null ? s.fcf3 : s.fcf} hide={s.kind === 'bdc' || s.kind === 'bank'} />
            <div className="rc"><div className="k">Growth streak</div><div className="v">{s.streak.years ? `${s.streak.capped ? '≥' : ''}${s.streak.years} yr` : s.streak.cut ? 'cut' : '0 yr'}</div><div className="s">{s.streak.years ? (s.streak.capped ? `every year in SEC data (since ${s.streak.since})` : `raised every year since ${s.streak.since}`) : s.streak.firstYear ? 'no raise last FY' : '—'}</div></div>
          </div>}
          <p className="reason">{s.reason}</p>
          {open === h.ticker && s.fy && t?.sec && <Detail s={s} sec={t.sec} cik={t.sec.cik ?? t.cik ?? null} />}
          {s.fy && <div className="fine">Source: SEC EDGAR companyfacts, 10-K data through {s.fy} (period ended {s.end}). {open === h.ticker ? '' : 'Tap for history.'}</div>}
        </section>
      ))}
    </>
  );
}
function RatioCell({ k, r, hide }: { k: string; r: Ratio; hide?: boolean }) {
  const v = r.value;
  const tone = v == null ? '' : v > 1 ? 'red' : v > 0.75 ? 'amber' : 'green';
  return <div className="rc"><div className="k">{k}</div><div className={'v ' + (hide ? '' : tone)}>{hide ? 'n/m' : v == null ? (r.note ? 'neg.' : '—') : pct(v, 0)}</div><div className="s">{hide ? 'not meaningful here' : r.years}</div></div>;
}
function Detail({ s, sec, cik }: { s: Safety; sec: NonNullable<Ctx['data'][string]['sec']>; cik: number | null }) {
  const years = (s.dpsAdj ?? sec.dps).slice(-12);
  const max = Math.max(...years.map(d => d.v), 0.0001);
  return (
    <div className="detail" onClick={e => e.stopPropagation()}>
      <div className="k">Dividends per share by fiscal year ({sec.dpsTag === 'CommonStockDividendsPerShareDeclared' ? 'declared' : 'cash paid'})</div>
      <div className="dpsbars">{years.map((d, i) => <div key={d.end} className="db"><div className="bar" style={{ height: `${(d.v / max) * 64}px`, background: i && d.v < years[i - 1].v ? '#f43f5e' : '#10b981' }} /><span>{d.v.toFixed(2)}</span><em>’{d.end.slice(2, 4)}</em></div>)}</div>
      {s.splits?.length ? <p className="fine">Earlier years rescaled for a stock split around {s.splits.join(', ')} (SEC filings before a split aren’t restated).</p> : null}
      <table className="items small"><tbody>
        <tr><td>Dividends paid ({s.fy})</td><td className="n">{s.earn.num != null ? money(s.earn.num) : '—'}</td></tr>
        <tr><td>Net income ({s.fy})</td><td className="n">{s.earn.den != null ? money(s.earn.den) : '—'}</td></tr>
        <tr><td>Free cash flow ({s.fy})</td><td className="n">{s.fcfLatest != null ? money(s.fcfLatest) : '—'}</td></tr>
        <tr><td>Payout vs earnings ({s.fy})</td><td className="n">{pct(s.earn.value, 0)}</td></tr>
        <tr><td>Payout vs FCF ({s.fy})</td><td className="n">{pct(s.fcf.value, 0)}{s.fcf.note ? ` · ${s.fcf.note}` : ''}</td></tr>
      </tbody></table>
      {(sec as any).note && <p className="fine">{(sec as any).note}.</p>}
      {cik && <a className="fine" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K`} target="_blank" rel="noreferrer">View 10-K filings on SEC EDGAR ↗</a>}
    </div>
  );
}

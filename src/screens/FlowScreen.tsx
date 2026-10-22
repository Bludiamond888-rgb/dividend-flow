import { useMemo, useState } from 'react';
import { C, FlowChart, PALETTE, type FLink, type FNode } from '../components/FlowChart';
import { dateLong, dps, money, pct } from '../lib/format';
import { isIrregular } from '../lib/income';
import type { Ctx } from './ctx';
import { Empty, Kpi, Sheet, sourceLine } from './common';

const MAX_NODES = typeof window !== 'undefined' && window.innerWidth < 560 ? 10 : 12;
export function FlowScreen({ ctx }: { ctx: Ctx }) {
  const { pf } = ctx;
  const [sel, setSel] = useState<string | null>(null);
  const paying = useMemo(() => pf.rows.filter(r => r.annual > 0).sort((a, b) => b.annual - a.annual), [pf]);
  const colorOf = useMemo(() => { const m: Record<string, string> = {}; paying.forEach((r, i) => (m[r.h.id] = PALETTE[i % PALETTE.length])); return m; }, [paying]);
  const graph = useMemo(() => {
    if (!pf.total) return null;
    const shown = paying.length > MAX_NODES ? paying.slice(0, MAX_NODES - 1) : paying;
    const rest = paying.slice(shown.length);
    const nodes: FNode[] = shown.map(r => ({ id: r.h.id, label: r.h.ticker, value: r.annual, kind: 'holding', color: colorOf[r.h.id] }));
    if (rest.length) nodes.push({ id: 'other', label: `${rest.length} more`, value: rest.reduce((s, r) => s + r.annual, 0), kind: 'other', color: C.other });
    nodes.push({ id: 'total', label: 'Annual income', value: pf.total, kind: 'total', color: C.total });
    const links: FLink[] = nodes.filter(n => n.kind !== 'total').map(n => ({ source: n.id, target: 'total', value: n.value, color: n.color }));
    if (pf.reinvested > 0) { nodes.push({ id: 'drip', label: 'Reinvested', value: pf.reinvested, kind: 'drip', color: C.drip }); links.push({ source: 'total', target: 'drip', value: pf.reinvested, color: C.drip }); }
    if (pf.cash > 0) { nodes.push({ id: 'cash', label: 'Cash', value: pf.cash, kind: 'cash', color: C.cash }); links.push({ source: 'total', target: 'cash', value: pf.cash, color: C.cash }); }
    return { nodes, links, rest };
  }, [pf, paying, colorOf]);
  if (!ctx.portfolio.length) return <Empty ctx={ctx} what="where your dividend income comes from" />;
  const missing = pf.rows.filter(r => r.annual === 0);
  const selRow = pf.rows.find(r => r.h.id === sel);
  return (
    <>
      <section className="kpis card">
        <Kpi k="Annual income" v={money(pf.total)} s="next 12 months" tone="hero" />
        <Kpi k="Per month" v={money(pf.total / 12)} s="average" />
        <Kpi k="Portfolio yield" v={pct(pf.yieldPct)} s={pf.value ? `on ${money(pf.value, false)}` : undefined} />
        <Kpi k="Reinvested · Cash" v={<><span className="drip">{pf.total ? Math.round((pf.reinvested / pf.total) * 100) : 0}%</span> · <span className="cash">{pf.total ? Math.round((pf.cash / pf.total) * 100) : 0}%</span></>} s="DRIP split" />
      </section>
      <section className="card chartcard">
        <div className="cardhead"><h2>Where the income comes from</h2></div>
        {graph ? <FlowChart nodes={graph.nodes} links={graph.links} total={pf.total} selected={sel} onPick={id => setSel(id === sel ? null : id)} /> : <p className="fine pad">None of your holdings has dividend data yet. Add a dividend schedule on the Holdings tab.</p>}
        <div className="legend"><span><i style={{ background: C.drip }} />Reinvested (DRIP on)</span><span><i style={{ background: C.cash }} />Cash (DRIP off)</span><span className="tipl">Tap any bar for details</span></div>
        <p className="source">{sourceLine(ctx)}. Annual income = the next 12 months of expected payments for the shares you hold now.</p>
      </section>
      {missing.length > 0 && <div className="card note">No dividend data for {missing.map(r => r.h.ticker).join(', ')}{missing.some(r => r.proj.method.startsWith('no dividend since')) ? ' (or no recent payment)' : ''}. <a onClick={() => ctx.go('holdings')}>Add a schedule</a>.</div>}
      {paying.length > 0 && (
        <section className="card">
          <table className="items"><thead><tr><th>Holding</th><th className="n">Annual</th><th className="n">Share</th><th className="n">Yield</th></tr></thead><tbody>
            {paying.map(r => (
              <tr key={r.h.id} onClick={() => setSel(r.h.id)} className={sel === r.h.id ? 'on' : ''}>
                <td><span className="dot" style={{ background: colorOf[r.h.id] }} /><b>{r.h.ticker}</b> {r.h.drip && <span className="tag drip">DRIP</span>}</td>
                <td className="n"><b>{money(r.annual)}</b></td>
                <td className="n m">{pct(r.annual / pf.total, 1)}</td>
                <td className="n">{pct(r.yieldPct)}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
      {sel && (selRow ? (
        <Sheet title={<>{selRow.h.ticker} <span className="sub">{selRow.t?.name ?? ''}</span></>} eyebrow="HOLDING" onClose={() => setSel(null)}>
          <div className="big">{money(selRow.annual)}<small>/yr</small></div>
          <div className="row"><span>{pct(pf.total ? selRow.annual / pf.total : 0, 1)} of your total income</span><span>{selRow.h.drip ? 'DRIP on: reinvested' : 'DRIP off: paid as cash'}</span></div>
          <div className="grid2">
            <Kpi k="Yield" v={pct(selRow.yieldPct)} s={selRow.t?.price ? `at ${money(selRow.t.price)}` : 'no price'} />
            <Kpi k="Dividend / share" v={selRow.proj.dpsAnnual ? dps(selRow.proj.dpsAnnual) : '—'} s="next 12 months" />
            <Kpi k="Shares" v={selRow.h.shares.toLocaleString('en-US')} s={`${selRow.proj.freq || '—'}× per year`} />
            <Kpi k="Yield on cost" v={pct(selRow.yoc)} s={selRow.h.cost ? `cost ${money(selRow.h.cost, false)}` : 'no cost basis'} />
          </div>
          {selRow.t && isIrregular(selRow.t.divs, selRow.yieldPct, ctx.today) && <p className="tipbox warnbox">Irregular payer: too few recent payments or an unusually high yield (likely a special distribution). Treat this projection with caution.</p>}
          <p className="fine">Method: {selRow.proj.method}.{selRow.proj.specialsExcluded ? ' Special/supplemental dividends are excluded from the forecast.' : ''}</p>
          <p className="fine">Price {selRow.t?.priceDate ? `as of ${dateLong(selRow.t.priceDate)}` : '—'} ({selRow.t?.live ?? selRow.t?.sources?.price ?? 'manual'}). Dividends: {selRow.h.manual ? 'your manual schedule' : selRow.t?.sources?.dividends ?? '—'}.</p>
        </Sheet>
      ) : sel === 'other' && graph ? (
        <Sheet title={`${graph.rest.length} smaller holdings`} onClose={() => setSel(null)}>
          <div className="big">{money(graph.rest.reduce((s, r) => s + r.annual, 0))}<small>/yr</small></div>
          <ul className="plain">{graph.rest.map(r => <li key={r.h.id}><b>{r.h.ticker}</b> {money(r.annual)} · {pct(r.annual / pf.total, 1)}</li>)}</ul>
        </Sheet>
      ) : (
        <Sheet title={sel === 'drip' ? 'Reinvested (DRIP)' : sel === 'cash' ? 'Paid as cash' : 'Total annual income'} onClose={() => setSel(null)}>
          <div className="big">{money(sel === 'drip' ? pf.reinvested : sel === 'cash' ? pf.cash : pf.total)}<small>/yr</small></div>
          <div className="row"><span>{pct(pf.total ? (sel === 'drip' ? pf.reinvested : sel === 'cash' ? pf.cash : pf.total) / pf.total : 0, 1)} of total</span><span>{money((sel === 'drip' ? pf.reinvested : sel === 'cash' ? pf.cash : pf.total) / 12)} per month on average</span></div>
          <p>{sel === 'drip' ? 'Dividends from holdings with DRIP turned on buy more shares automatically, so this income compounds.' : sel === 'cash' ? 'Dividends from holdings with DRIP off land in your account as cash you can spend or redeploy.' : 'Expected dividends over the next 12 months for the shares you hold today, using the latest regular dividend rate (stocks) or the last 12 months of distributions (funds).'}</p>
          <ul className="plain">{pf.rows.filter(r => r.annual > 0 && (sel === 'total' || (sel === 'drip') === r.h.drip)).sort((a, b) => b.annual - a.annual).map(r => <li key={r.h.id}><b>{r.h.ticker}</b> {money(r.annual)}</li>)}</ul>
        </Sheet>
      ))}
    </>
  );
}

import { useMemo, useRef, useState } from 'react';
import { searchUniverse } from '../lib/search';
import { finnhubDps, finnhubQuote, proxyTicker, settings, clearTickerCache } from '../lib/data';
import { importCsv, newId, toCsv } from '../lib/csv';
import { makeBackup, readBackup } from '../lib/store';
import { defaultMonths } from '../lib/income';
import { money, monShort, pct } from '../lib/format';
import type { Holding, ManualDiv } from '../lib/types';
import type { Ctx } from './ctx';
import { Sheet } from './common';

function download(name: string, text: string, type: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function HoldingsScreen({ ctx }: { ctx: Ctx }) {
  const [edit, setEdit] = useState<Holding | 'new' | null>(null);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const csvRef = useRef<HTMLInputElement>(null), jsonRef = useRef<HTMLInputElement>(null);
  const list = ctx.portfolio;
  const ro = ctx.sample;
  const rowOf = (h: Holding) => ctx.pf.rows.find(r => r.h.id === h.id);
  const onCsv = async (f: File) => {
    const r = importCsv(await f.text());
    if (!r.holdings.length) { setMsg({ t: `No holdings imported. ${r.skipped[0]?.why ?? ''}`, bad: true }); return; }
    const byT = new Map(ctx.holdings.map(h => [h.ticker, h]));
    for (const h of r.holdings) { const ex = byT.get(h.ticker); byT.set(h.ticker, ex ? { ...ex, shares: h.shares, cost: h.cost || ex.cost } : h); }
    ctx.setHoldings([...byT.values()]); ctx.setSample(false);
    setMsg({ t: `Imported ${r.holdings.length} holding${r.holdings.length > 1 ? 's' : ''} (existing tickers updated).${r.skipped.length ? ` Skipped ${r.skipped.length} row(s): ${r.skipped.slice(0, 3).map(s => `line ${s.line} ${s.why}`).join('; ')}.` : ''}` });
  };
  const onJson = async (f: File) => {
    try { const b = readBackup(await f.text()); if (!confirm(`Replace your ${ctx.holdings.length} holdings with ${b.holdings.length} from the backup?`)) return; ctx.setHoldings(b.holdings); if (b.settings.margin != null) settings.margin = b.settings.margin; ctx.setSample(false); setMsg({ t: `Restored ${b.holdings.length} holdings.` }); }
    catch (e) { setMsg({ t: (e as Error).message, bad: true }); }
  };
  return (
    <>
      <section className="card samplecard">
        <label className="switch"><input type="checkbox" checked={ctx.sample} onChange={e => ctx.setSample(e.target.checked)} /><span className="knob" /> <span><b>Show sample portfolio</b><br /><small>Illustrative demo holdings. Your own holdings stay saved and come back when this is off.</small></span></label>
      </section>
      {!ro && <section className="actions">
        <button className="primary" onClick={() => setEdit('new')}>＋ Add holding</button>
        <button className="ghost" onClick={() => csvRef.current?.click()}>Import CSV</button>
        <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ''; }} />
      </section>}
      {msg && <div className={'card ' + (msg.bad ? 'warn' : 'goodsoft')}>{msg.t}</div>}
      {list.length === 0 && <section className="card empty"><h2>Your holdings</h2><p>Add each dividend stock or fund with its share count and cost basis, or import a CSV with columns <code>Ticker, Shares, Cost Basis, DRIP</code>.</p></section>}
      {list.map(h => {
        const r = rowOf(h); const t = ctx.data[h.ticker];
        return (
          <section key={h.id} className="card hold" onClick={() => !ro && setEdit(h)}>
            <div className="hrow">
              <div className="hl"><b className="tk">{h.ticker}</b><div className="nm">{t?.name ?? (h.manual ? 'Manual dividend schedule' : 'Not in bundled data')}</div></div>
              <div className="hr"><b>{r ? money(r.annual) : '—'}</b><small>/yr</small><div className="nm">{r?.yieldPct != null ? `${pct(r.yieldPct)} yield` : 'no dividend data'}</div></div>
            </div>
            <div className="hmeta">
              <span>{h.shares.toLocaleString('en-US')} sh</span>
              <span>{r?.value ? money(r.value, false) : '—'} value</span>
              <span>cost {h.cost ? money(h.cost, false) : '—'}</span>
              <label className="switch sm" onClick={e => e.stopPropagation()}><input type="checkbox" checked={h.drip} disabled={ro} onChange={e => ctx.setHoldings(ctx.holdings.map(x => x.id === h.id ? { ...x, drip: e.target.checked } : x))} /><span className="knob" /> DRIP</label>
            </div>
            {!t && !h.manual && <div className="fine warnline">Needs a dividend schedule: tap to add amount, frequency and pay months.</div>}
          </section>
        );
      })}
      {!ro && <section className="card backup">
        <div className="cardhead"><h2>Backup</h2></div>
        <p className="fine">Holdings live only in this browser (localStorage). Export a backup now and then.</p>
        <div className="btnrow">
          <button className="ghost" disabled={!ctx.holdings.length} onClick={() => download(`dividend-flow-backup-${ctx.today}.json`, JSON.stringify(makeBackup(ctx.holdings, { margin: settings.margin }), null, 2), 'application/json')}>Export JSON</button>
          <button className="ghost" disabled={!ctx.holdings.length} onClick={() => download(`dividend-flow-holdings-${ctx.today}.csv`, toCsv(ctx.holdings), 'text/csv')}>Export CSV</button>
          <button className="ghost" onClick={() => jsonRef.current?.click()}>Restore JSON</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onJson(f); e.target.value = ''; }} />
        </div>
      </section>}
      {edit && <EditSheet ctx={ctx} h={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditSheet({ ctx, h, onClose }: { ctx: Ctx; h: Holding | null; onClose: () => void }) {
  const [ticker, setTicker] = useState(h?.ticker ?? '');
  const [q, setQ] = useState(h?.ticker ?? '');
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState(h ? String(h.shares) : '');
  const [cost, setCost] = useState(h ? String(h.cost || '') : '');
  const [drip, setDrip] = useState(h?.drip ?? false);
  const [useManual, setUseManual] = useState(!!h?.manual);
  const [m, setM] = useState<ManualDiv>(h?.manual ?? { amount: 0, freq: 4, months: defaultMonths(4) });
  const [amt, setAmt] = useState(h?.manual ? String(h.manual.amount) : '');
  const [note, setNote] = useState('');
  const T = ticker.trim().toUpperCase();
  const bundled = ctx.bundled.has(T);
  const results = useMemo(() => (ctx.universe ? searchUniverse(ctx.universe.rows, q, 25) : []), [ctx.universe, q]);
  const sel = ctx.universe?.rows.find(r => r[0] === T);
  const needManual = !!T && !bundled && !ctx.data[T] && results.length === 0;

  const manualOn = useManual || needManual;
  const sh = parseFloat(shares), c = parseFloat(cost.replace(/[$,]/g, '')) || 0, a = parseFloat(amt);
  const valid = /^[A-Z0-9.-]{1,10}$/.test(T) && sh > 0 && (bundled || !!ctx.data[T] || manualOn) && (!manualOn || (a > 0 && m.months.length === m.freq));
  const save = () => {
    const manual = manualOn ? { ...m, amount: a } : null;
    const nh: Holding = { id: h?.id ?? newId(), ticker: T, shares: sh, cost: c, drip, manual };
    const others = ctx.holdings.filter(x => x.id !== nh.id);
    const dup = others.find(x => x.ticker === T);
    ctx.setHoldings(dup ? others.map(x => x.id === dup.id ? { ...nh, id: dup.id, shares: dup.shares + sh, cost: dup.cost + c } : x) : [...others, nh]);
    onClose();
  };
  const setFreq = (f: 1 | 2 | 4 | 12) => setM({ ...m, freq: f, months: defaultMonths(f) });
  const toggleMonth = (mo: number) => {
    const has = m.months.includes(mo);
    let months = has ? m.months.filter(x => x !== mo) : [...m.months, mo].sort((x, y) => x - y);
    if (months.length > m.freq) months = months.slice(-m.freq);
    setM({ ...m, months });
  };
  return (
    <Sheet title={h ? `Edit ${h.ticker}` : 'Add holding'} onClose={onClose}>
      <div className="field">Ticker or company
        <div className="search">
          <input value={q} onChange={e => { setQ(e.target.value); setTicker(e.target.value.toUpperCase().trim().replace('.', '-')); setOpen(true); }} onFocus={() => setOpen(true)}
            placeholder="Search e.g. KO, Coca-Cola, SCHD" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="search" aria-label="Search ticker or company" />
          {open && results.length > 0 && !(results.length === 1 && results[0][0] === T && q.toUpperCase() === T) && (
            <ul className="results" role="listbox">
              {results.map(r => (
                <li key={r[0]} role="option" onMouseDown={e => e.preventDefault()} onClick={() => { setTicker(r[0]); setQ(r[0]); setOpen(false); }}>
                  <b>{r[0]}</b><span>{r[1]}</span><em className={r[2] === 'F' ? 'fund' : ''}>{r[2] === 'F' ? 'ETF' : 'Stock'}</em><i>{r[5] ? 'irregular' : `${(r[3] * 100).toFixed(2)}%`}</i>
                </li>))}
            </ul>)}
        </div>
        <small>{!T ? `${(ctx.universe?.rows.length ?? ctx.index?.tickers.length ?? 0).toLocaleString('en-US')} US dividend stocks and ETFs searchable${ctx.universe ? ` (as of ${ctx.universe.asOf})` : ''}.`
          : sel ? <>✓ {sel[1]} · {sel[2] === 'F' ? 'ETF/fund' : 'stock'} · {sel[5] ? <b className="warnline">irregular payer: projections unreliable</b> : `${(sel[3] * 100).toFixed(2)}% forward yield`}</>
          : bundled ? `✓ ${ctx.index?.tickers.find(t => t.ticker === T)?.name ?? T}: bundled price and dividend history.`
          : ctx.data[T] ? 'Live data loaded via proxy.' : results.length ? 'Pick a match above, or keep typing.' : 'Not in the dividend universe (no dividend in ~13 months, or not US-listed): enter its schedule below.'}</small>
      </div>
      {!h && !T && <div className="quick">{ctx.index?.tickers.slice(0, 18).map(t => <button key={t.ticker} onClick={() => { setTicker(t.ticker); setQ(t.ticker); }}>{t.ticker}</button>)}</div>}
      <div className="grid2">
        <label className="field">Shares<input inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} placeholder="0" /></label>
        <label className="field">Cost basis (total $)<input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="optional" /></label>
      </div>
      <label className="switch"><input type="checkbox" checked={drip} onChange={e => setDrip(e.target.checked)} /><span className="knob" /> Reinvest dividends (DRIP)</label>
      {T && !needManual && <label className="check"><input type="checkbox" checked={useManual} onChange={e => setUseManual(e.target.checked)} /> Use my own dividend schedule instead</label>}
      {T && !bundled && (settings.finnhub || settings.workerUrl) && <div className="btnrow">
        {settings.workerUrl && <button className="ghost" onClick={async () => { try { setNote('Loading…'); await proxyTicker(T); clearTickerCache(); ctx.refresh(); setNote('Live dividend history loaded via proxy.'); } catch (e) { setNote((e as Error).message); } }}>Load via proxy</button>}
        {settings.finnhub && <button className="ghost" onClick={async () => { try { setNote('Asking Finnhub…'); const q = await finnhubQuote(T); const d = await finnhubDps(T); setNote(`Finnhub: price $${q.price} (${q.priceDate})${d ? `; dividends/share last 12 months $${d.toFixed(4)}. Divide by payments per year for the amount.` : '; no dividend figure.'}`); if (d && !amt) setAmt((d / m.freq).toFixed(4)); } catch (e) { setNote((e as Error).message); } }}>Look up on Finnhub</button>}
      </div>}
      {note && <p className="fine">{note}</p>}
      {manualOn && <div className="manual">
        <div className="k">Dividend schedule (manual)</div>
        <div className="grid2">
          <label className="field">Amount per payment ($/share)<input inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} placeholder="from the company/fund site" /></label>
          <div className="field">Payments per year<div className="seg full">{([12, 4, 2, 1] as const).map(f => <button key={f} className={m.freq === f ? 'on' : ''} onClick={() => setFreq(f)}>{f === 12 ? 'Mo' : f === 4 ? 'Qtr' : f === 2 ? 'Semi' : 'Yr'}</button>)}</div></div>
        </div>
        <div className="field">Typical pay months ({m.months.length}/{m.freq})
          <div className="months">{Array.from({ length: 12 }, (_, i) => i + 1).map(mo => <button key={mo} className={m.months.includes(mo) ? 'on' : ''} onClick={() => toggleMonth(mo)}>{monShort(mo)}</button>)}</div>
          <small>Payments are placed mid-month and labeled est.{!settings.finnhub && ' Tip: a free Finnhub key (Settings) can look up the last-12-month dividend and live price.'}</small>
        </div>
      </div>}
      <button className="primary" disabled={!valid} onClick={save}>{h ? 'Save' : 'Add holding'}</button>
      {h && <button className="danger" onClick={() => { if (confirm(`Remove ${h.ticker}?`)) { ctx.setHoldings(ctx.holdings.filter(x => x.id !== h.id)); onClose(); } }}>Remove {h.ticker}</button>}
    </Sheet>
  );
}

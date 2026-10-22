import { useState } from 'react';
import { clearTickerCache, finnhubQuote, settings } from '../lib/data';
import type { Index } from '../lib/types';
import { Sheet } from './common';

export function SettingsSheet({ onClose, index }: { onClose: () => void; index: Index | null }) {
  const [k, setK] = useState(settings.finnhub), [w, setW] = useState(settings.workerUrl), [m, setM] = useState(settings.margin);
  const [msg, setMsg] = useState('');
  const save = () => { settings.finnhub = k; settings.workerUrl = w; settings.margin = m; clearTickerCache(); onClose(); };
  const refreshPrices = async () => {
    settings.finnhub = k;
    const hs: { ticker: string }[] = JSON.parse(localStorage.getItem('df.holdings') || '[]');
    const ts = [...new Set(hs.map(h => h.ticker))]; let ok = 0; const bad: string[] = [];
    for (const t of ts) { try { await finnhubQuote(t); ok++; } catch { bad.push(t); } await new Promise(r => setTimeout(r, 120)); }
    clearTickerCache(); setMsg(`Updated ${ok} price${ok === 1 ? '' : 's'} from Finnhub.${bad.length ? ` Failed: ${bad.join(', ')}.` : ''}`);
  };
  return (
    <Sheet title="Settings" onClose={onClose}>
      <label className="field">Schwab margin rate (%)
        <input inputMode="decimal" value={m} onChange={e => setM(e.target.value)} placeholder="enter current first-tier rate" />
        <small>Used on the Yield tab. There is no free API for it, so check schwab.com/margin and type Schwab’s current first-tier rate.</small>
      </label>
      <label className="field">Finnhub API key (optional, free at finnhub.io)
        <input value={k} onChange={e => setK(e.target.value)} placeholder="paste key" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <small>Stored only on this device. Free tier: live prices (/quote) and last-12-month dividend per share (/stock/metric). Finnhub’s dividend calendar (/stock/dividend) is premium, so pay dates still come from bundled data or your manual schedule.</small>
      </label>
      {k && <><button className="ghost wide" onClick={refreshPrices}>Refresh my holdings’ prices from Finnhub</button>{msg && <p className="fine">{msg}</p>}</>}
      <label className="field">Data proxy URL (optional Cloudflare Worker)
        <input value={w} onChange={e => setW(e.target.value)} placeholder="https://dividend-flow-proxy.<you>.workers.dev" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <small>Loads dividend history and SEC data live for tickers outside the bundled list. See worker/README.md in the repo.</small>
      </label>
      <button className="primary" onClick={save}>Save</button>
      <div className="sources">
        <div className="k">Data sources</div>
        <ul>
          <li><b>Prices, dividend amounts, ex-dates:</b> Yahoo Finance chart API (no key), bundled for {index?.tickers.length ?? '…'} tickers, as of {index?.tickers[0]?.priceDate ?? '—'}.</li>
          <li><b>Payment dates:</b> Nasdaq.com dividend history (Nasdaq-listed symbols: {index?.lag?.from?.join(', ') ?? '—'}). Others are estimated as ex-date + {index?.lag?.stock ?? '—'} days (stocks) or + {index?.lag?.fund ?? '—'} days (funds), the median gap in that published data, and marked est.</li>
          <li><b>Payout safety:</b> SEC EDGAR XBRL companyfacts (10-K annual data).</li>
          <li><b>Inflation:</b> BLS CPI-U {index?.cpi ? `(${index.cpi.period})` : ''}.</li>
          <li>Bundled data refreshes weekly via GitHub Actions; last build {index ? index.updated.slice(0, 10) : '—'}.</li>
        </ul>
      </div>
    </Sheet>
  );
}

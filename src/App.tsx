import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadIndex, loadTicker, settings } from './lib/data';
import { portfolioIncome } from './lib/income';
import { loadHoldings, SAMPLE, saveHoldings } from './lib/store';
import type { Holding, Index, TickerData } from './lib/types';
import { todayISO } from './lib/format';
import { FlowScreen } from './screens/FlowScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { SnowballScreen } from './screens/SnowballScreen';
import { YieldScreen } from './screens/YieldScreen';
import { HoldingsScreen } from './screens/HoldingsScreen';
import { SettingsSheet } from './screens/Settings';
import type { Ctx } from './screens/ctx';

const TABS = [
  { id: 'flow', label: 'Flow', icon: <svg viewBox="0 0 24 24"><path d="M3 5c6 0 7 7 12 7h6M3 12h12M3 19c6 0 7-7 12-7" /></svg> },
  { id: 'calendar', label: 'Calendar', icon: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg> },
  { id: 'safety', label: 'Safety', icon: <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg> },
  { id: 'snowball', label: 'Snowball', icon: <svg viewBox="0 0 24 24"><path d="M4 20V14M9 20V11M14 20V8M19 20V4" /></svg> },
  { id: 'yield', label: 'Yield', icon: <svg viewBox="0 0 24 24"><path d="M5 19L19 5" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></svg> },
  { id: 'holdings', label: 'Holdings', icon: <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg> },
] as const;
type Tab = typeof TABS[number]['id'];
const tabFromHash = (): Tab => { const h = location.hash.slice(1); return (TABS.find(t => t.id === h)?.id ?? 'flow') as Tab; };

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [index, setIndex] = useState<Index | null>(null);
  const [holdings, setHoldingsState] = useState<Holding[]>(loadHoldings);
  const [sample, setSample] = useState(() => localStorage.getItem('df.sample') === '1');
  const [data, setData] = useState<Record<string, TickerData>>({});
  const [ver, setVer] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [err, setErr] = useState('');
  const today = todayISO();

  useEffect(() => { const f = () => setTab(tabFromHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { loadIndex().then(setIndex).catch(() => setErr('Could not load bundled data. If you are offline, open the app once online first.')); }, []);
  useEffect(() => { localStorage.setItem('df.sample', sample ? '1' : '0'); }, [sample]);
  const setHoldings = useCallback((h: Holding[]) => { setHoldingsState(h); saveHoldings(h); }, []);
  const portfolio = sample ? SAMPLE : holdings;
  const bundled = useMemo(() => new Set(index?.tickers.map(t => t.ticker) ?? []), [index]);
  useEffect(() => {
    if (!index) return;
    const need = [...new Set(portfolio.map(h => h.ticker))];
    Promise.all(need.map(t => loadTicker(t, bundled.has(t)).then(d => [t, d] as const))).then(rs => {
      const m: Record<string, TickerData> = {}; for (const [t, d] of rs) if (d) m[t] = d; setData(m);
    });
  }, [index, portfolio, bundled, ver]);
  const pf = useMemo(() => portfolioIncome(portfolio, data, today, index?.lag), [portfolio, data, today, index]);
  const go = (t: Tab) => { location.hash = t; setTab(t); scrollTo(0, 0); };
  const ctx: Ctx = { pf, data, index, today, holdings, portfolio, sample, setSample, setHoldings, bundled, go, refresh: () => setVer(v => v + 1), openSettings: () => setShowSettings(true) };
  const title = TABS.find(t => t.id === tab)!.label;

  return (
    <div className="shell">
      <nav className="tabs" aria-label="Sections">
        <div className="brand side"><img src="./icon-192.png" alt="" /><span>Dividend Flow</span></div>
        {TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
        <div className="side sidefoot">Data: Yahoo Finance, Nasdaq, SEC EDGAR, BLS. Not investment advice.</div>
      </nav>
      <main className="app">
        <header className="top">
          <div className="brand"><img src="./icon-192.png" alt="" /><span>Dividend Flow</span></div>
          <h1 className="pagetitle">{title}</h1>
          <button className="icon" aria-label="Settings" onClick={() => setShowSettings(true)}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        </header>
        {sample && <div className="samplebar">Sample portfolio: illustrative shares and costs, not your holdings. <a onClick={() => setSample(false)}>Turn off</a></div>}
        {err && <div className="card warn">{err}</div>}
        {tab === 'flow' && <FlowScreen ctx={ctx} />}
        {tab === 'calendar' && <CalendarScreen ctx={ctx} />}
        {tab === 'safety' && <SafetyScreen ctx={ctx} />}
        {tab === 'snowball' && <SnowballScreen ctx={ctx} />}
        {tab === 'yield' && <YieldScreen ctx={ctx} />}
        {tab === 'holdings' && <HoldingsScreen ctx={ctx} />}
        <footer>
          {index && <>Bundled market data as of {index.tickers[0]?.priceDate ?? '—'} (refreshed weekly). </>}
          Projections and estimates are not guarantees. Not investment advice.
        </footer>
      </main>
      {showSettings && <SettingsSheet onClose={() => { setShowSettings(false); setVer(v => v + 1); }} index={index} />}
    </div>
  );
}
export { settings };

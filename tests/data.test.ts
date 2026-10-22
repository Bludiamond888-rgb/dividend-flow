// Sanity checks on the bundled data set (runs against whatever the last refresh produced).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectHolding } from '../src/lib/income';
import { payoutSafety } from '../src/lib/safety';
import type { Index, TickerData } from '../src/lib/types';
const idx: Index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8'));
const load = (t: string): TickerData => JSON.parse(fs.readFileSync(`public/data/${t}.json`, 'utf8'));
describe('bundled data', () => {
  it('has CPI with a period and source', () => { expect(idx.cpi?.yoy).toBeTypeOf('number'); expect(idx.cpi?.period).toMatch(/\d{4}/); });
  it.each(idx.tickers.map(t => t.ticker))('%s: price, dividends, projection, safety', t => {
    const d = load(t);
    expect(d.price).toBeGreaterThan(0);
    expect(d.priceDate).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(d.divs.length).toBeGreaterThan(3);
    const ref = d.priceDate!;
    const p = projectHolding({ id: 'x', ticker: t, shares: 1, cost: 0, drip: false }, d, ref, idx.lag);
    expect([1, 2, 4, 12]).toContain(p.freq);
    expect(p.payments.length).toBeGreaterThanOrEqual(p.freq - 1);
    const y = p.dpsAnnual / d.price!;
    expect(y).toBeGreaterThan(0.003); expect(y).toBeLessThan(0.25);
    const s = payoutSafety(d.sec, { type: d.type, name: d.name, divs: d.divs });
    if (d.type === 'fund') expect(s.kind).toBe('fund'); else expect(s.fy).toMatch(/^FY20\d\d$/);
  });
});

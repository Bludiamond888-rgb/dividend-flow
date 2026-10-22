import { describe, expect, it } from 'vitest';
import { adjustSplits, growthStreak, payoutSafety } from '../src/lib/safety';
import { annual, secMetrics, type SecMetrics } from '../src/lib/sec';

const A = (pairs: [number, number][]) => pairs.map(([y, v]) => ({ end: `${y}-12-31`, v }));
const sec = (o: Partial<SecMetrics>): SecMetrics => ({ fy: 2025, end: '2025-12-31', dps: [], dpsTag: 'CommonStockDividendsPerShareDeclared', divPaid: [], netIncome: [], ocf: [], capex: [], niTag: 'NetIncomeLoss', capexTag: null, bdc: false, bank: false, ...o });

describe('growthStreak', () => {
  it('counts consecutive raises back from the latest year', () => {
    expect(growthStreak(A([[2019, 1], [2020, 1.1], [2021, 1.1], [2022, 1.2], [2023, 1.3], [2024, 1.4]]))).toMatchObject({ years: 3, since: '2021', cut: false, capped: false });
  });
  it('flags a cut and caps at the data start', () => {
    expect(growthStreak(A([[2022, 2], [2023, 1]]))).toMatchObject({ years: 0, cut: true });
    expect(growthStreak(A([[2022, 1], [2023, 1.1], [2024, 1.2]]))).toMatchObject({ years: 2, capped: true });
  });
  it('rescales pre-split SEC values using split-adjusted history', () => {
    const dps = A([[2010, 1.64], [2011, 0.88], [2012, 0.94]]); // 2:1 split, older 10-K not restated
    const divs = [2010, 2011, 2012].flatMap((y, i) => [0, 1, 2, 3].map(k => ({ ex: `${y}-0${k * 3 + 1}-10`, amt: [0.205, 0.22, 0.235][i] })));
    const r = adjustSplits(dps, divs);
    expect(r.splits).toEqual(['2011']);
    expect(growthStreak(r.rows).years).toBe(2);
    // a real cut (also visible in the adjusted history) is not treated as a split
    const cutDivs = divs.map(d => (d.ex >= '2011' ? { ...d, amt: d.amt / 2 } : d));
    expect(adjustSplits(dps, cutDivs).splits).toEqual([]);
  });
});

describe('payoutSafety', () => {
  const base = { dps: A([[2021, 1], [2022, 1.05], [2023, 1.1], [2024, 1.15], [2025, 1.2]]) };
  it('green: both ratios comfortable, payout = dividends / net income and / (OCF - capex)', () => {
    const s = payoutSafety(sec({ ...base, divPaid: A([[2023, 40], [2024, 40], [2025, 40]]), netIncome: A([[2023, 100], [2024, 100], [2025, 100]]), ocf: A([[2023, 120], [2024, 120], [2025, 120]]), capex: A([[2023, 20], [2024, 20], [2025, 20]]) }), { type: 'stock', name: 'X' });
    expect(s.earn.value).toBeCloseTo(0.4); expect(s.fcf.value).toBeCloseTo(0.4); expect(s.earn3.value).toBeCloseTo(0.4);
    expect(s.badge).toBe('green'); expect(s.streak.years).toBe(4);
    expect(s.reason).toMatch(/40% of earnings and 40% of free cash flow/);
  });
  it('amber when one measure is over 100%', () => {
    const s = payoutSafety(sec({ ...base, divPaid: A([[2025, 80]]), netIncome: A([[2025, 100]]), ocf: A([[2025, 90]]), capex: A([[2025, 20]]) }), { type: 'stock', name: 'X' });
    expect(s.fcf.value).toBeCloseTo(80 / 70); expect(s.badge).toBe('amber');
  });
  it('red when earnings are negative or both > 100%', () => {
    expect(payoutSafety(sec({ ...base, divPaid: A([[2025, 50]]), netIncome: A([[2025, -10]]), ocf: A([[2025, 100]]), capex: A([[2025, 10]]) }), { type: 'stock', name: 'X' }).badge).toBe('red');
    expect(payoutSafety(sec({ ...base, divPaid: A([[2025, 150]]), netIncome: A([[2025, 100]]), ocf: A([[2025, 120]]), capex: A([[2025, 10]]) }), { type: 'stock', name: 'X' }).badge).toBe('red');
  });
  it('red on a dividend cut', () => {
    const s = payoutSafety(sec({ dps: A([[2024, 2], [2025, 1]]), divPaid: A([[2025, 10]]), netIncome: A([[2025, 100]]), ocf: A([[2025, 100]]), capex: A([[2025, 1]]) }), { type: 'stock', name: 'X' });
    expect(s.badge).toBe('red'); expect(s.reason).toMatch(/fell/);
  });
  it('funds are n/a (fund)', () => { const s = payoutSafety(null, { type: 'fund', name: 'Some ETF' }); expect(s.badge).toBe('na'); expect(s.kind).toBe('fund'); });
  it('REITs judged on cash flow', () => {
    const s = payoutSafety(sec({ ...base, divPaid: A([[2025, 70]]), netIncome: A([[2025, 30]]), ocf: A([[2025, 100]]) }), { type: 'stock', name: 'Realty Income Corp' });
    expect(s.kind).toBe('reit'); expect(s.badge).toBe('green'); expect(s.fcf.note).toMatch(/no capex/);
  });
});

describe('sec extraction', () => {
  it('keeps full-year 10-K facts only, latest filing wins', () => {
    const raw = { facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: [
      { start: '2024-01-01', end: '2024-12-31', val: 90, form: '10-K', filed: '2025-02-01' },
      { start: '2024-01-01', end: '2024-12-31', val: 95, form: '10-K', filed: '2026-02-01' }, // restated
      { start: '2025-07-01', end: '2025-09-30', val: 30, form: '10-Q', filed: '2025-11-01' },
      { start: '2025-01-01', end: '2025-12-31', val: 100, form: '10-K', filed: '2026-02-01' },
    ] } } } } };
    expect(annual(raw, ['NetIncomeLoss']).rows).toEqual([{ end: '2024-12-31', v: 95 }, { end: '2025-12-31', v: 100 }]);
    expect(secMetrics(raw).fy).toBe(2025);
  });
});

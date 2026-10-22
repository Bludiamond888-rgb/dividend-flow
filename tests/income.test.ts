import { describe, expect, it } from 'vitest';
import { calendar, detectFrequency, manualProjection, portfolioIncome, projectHolding, regular } from '../src/lib/income';
import type { Div, Holding, TickerData } from '../src/lib/types';

const q = (y: number, amt: number, pay = true): Div[] => ['03-01', '06-01', '09-01', '12-01'].map(md => ({ ex: `${y}-${md}`, amt, ...(pay ? { pay: `${y}-${md.slice(0, 2)}-15` } : {}) }));
const stock = (divs: Div[], price = 50): TickerData => ({ ticker: 'TST', name: 'Test Co', type: 'stock', price, priceDate: '2026-10-20', divs, sec: null });
const H = (o: Partial<Holding> = {}): Holding => ({ id: 'h1', ticker: 'TST', shares: 100, cost: 4000, drip: false, ...o });

describe('frequency + specials', () => {
  it('detects quarterly and monthly', () => {
    expect(detectFrequency([...q(2025, 0.5), ...q(2026, 0.5)], '2026-10-22')).toBe(4);
    const m: Div[] = Array.from({ length: 14 }, (_, i) => ({ ex: new Date(Date.UTC(2025, i, 5)).toISOString().slice(0, 10), amt: 0.1 }));
    expect(detectFrequency(m, '2026-10-22')).toBe(12);
  });
  it('drops large specials and extra mid-period supplementals', () => {
    const d: Div[] = [...q(2025, 0.5), { ex: '2025-12-20', amt: 3 }, ...q(2026, 0.52)].sort((a, b) => a.ex.localeCompare(b.ex));
    const r = regular(d);
    expect(r.some(x => x.amt === 3)).toBe(false);
    expect(r).toHaveLength(8);
  });
});

describe('projectHolding', () => {
  it('quarterly stock: 4 payments at the latest regular rate, pay dates from history', () => {
    const t = stock([...q(2025, 0.5), ...q(2026, 0.52).slice(0, 3)]); // history through Sep 2026
    const p = projectHolding(H(), t, '2026-10-22');
    expect(p.freq).toBe(4);
    expect(p.payments).toHaveLength(4);
    expect(p.payments.map(x => x.pay)).toEqual(['2026-12-15', '2027-03-15', '2027-06-15', '2027-09-15']);
    expect(p.dpsAnnual).toBeCloseTo(2.08, 6);
    expect(p.payments.every(x => x.perShare === 0.52 && x.amount === 52)).toBe(true);
    expect(p.payments.every(x => x.est)).toBe(true); // projected dates are estimates
  });
  it('declared upcoming payment is kept with its real date and not double-counted', () => {
    const t = stock([...q(2025, 0.5), ...q(2026, 0.52).slice(0, 3), { ex: '2026-12-01', amt: 0.55, pay: '2026-12-15' }]);
    const p = projectHolding(H(), t, '2026-10-22');
    expect(p.payments[0]).toMatchObject({ pay: '2026-12-15', perShare: 0.55, est: false, status: 'declared' });
    expect(p.payments).toHaveLength(4);
    expect(p.payments.slice(1).every(x => x.perShare === 0.55 && x.est)).toBe(true); // raise carried forward
  });
  it('estimates pay date from the default lag when none is published', () => {
    const t = stock([...q(2025, 0.5, false), ...q(2026, 0.5, false).slice(0, 3)]);
    const p = projectHolding(H(), t, '2026-10-22', { stock: 18, fund: 3, n: 1 });
    expect(p.payments[0].pay).toBe('2026-12-19');
    expect(p.payments[0].est).toBe(true);
  });
  it('funds repeat the last 12 months of variable distributions', () => {
    const m: Div[] = Array.from({ length: 12 }, (_, i) => ({ ex: new Date(Date.UTC(2025, 10 + i, 3)).toISOString().slice(0, 10), amt: 0.3 + i * 0.01 }));
    const t: TickerData = { ...stock(m), type: 'fund' };
    const p = projectHolding(H(), t, '2026-10-22', { stock: 18, fund: 3, n: 1 });
    expect(p.freq).toBe(12);
    expect(p.payments).toHaveLength(12);
    expect(p.dpsAnnual).toBeCloseTo(m.reduce((s, d) => s + d.amt, 0), 6);
  });
  it('suspended dividend projects nothing', () => {
    const p = projectHolding(H(), stock(q(2022, 0.5)), '2026-10-22');
    expect(p.payments).toHaveLength(0);
    expect(p.method).toMatch(/no dividend since/);
  });
  it('no data -> zero', () => { expect(projectHolding(H(), undefined, '2026-10-22').dpsAnnual).toBe(0); });
  it('manual schedule: amount x months in the window', () => {
    const p = manualProjection(H({ shares: 10 }), { amount: 0.25, freq: 4, months: [1, 4, 7, 10] }, '2026-10-22');
    expect(p.payments.map(x => x.pay)).toEqual(['2027-01-15', '2027-04-15', '2027-07-15', '2027-10-15']); // Oct 15 2026 already passed; Oct 15 2027 is inside [today, today+1y)
    expect(p.dpsAnnual).toBe(1);
  });
});

describe('portfolio + calendar', () => {
  const t = stock([...q(2025, 0.5), ...q(2026, 0.5).slice(0, 3)], 40);
  const hs = [H({ id: 'a', drip: true }), H({ id: 'b', ticker: 'TST', shares: 50, drip: false })];
  const pf = portfolioIncome(hs, { TST: t }, '2026-10-22');
  it('splits DRIP vs cash and computes yield', () => {
    expect(pf.total).toBeCloseTo(300, 6);
    expect(pf.reinvested).toBeCloseTo(200, 6);
    expect(pf.cash).toBeCloseTo(100, 6);
    expect(pf.yieldPct).toBeCloseTo(2 / 40, 6);
    expect(pf.rows[0].yoc).toBeCloseTo(200 / 4000, 6);
  });
  it('calendar buckets sum to the annual total; next payday countdown', () => {
    const cal = calendar(pf.rows.flatMap(r => r.proj.payments), '2026-10-22');
    expect(cal.months).toHaveLength(12);
    expect(cal.months[0].m).toBe(10);
    expect(cal.total).toBeCloseTo(pf.total, 6);
    expect(cal.monthlyAvg).toBeCloseTo(25, 6);
    expect(cal.next?.pay).toBe('2026-12-15');
    expect(cal.nextDays).toBe(54);
    expect(cal.nextGroup).toHaveLength(2);
    expect(cal.months.find(m => m.m === 12)!.total).toBeCloseTo(75, 6);
  });
});

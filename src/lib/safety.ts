// Payout safety from SEC annual facts.
import type { Annual, SecMetrics } from './sec';
export type Badge = 'green' | 'amber' | 'red' | 'na';
export type Streak = { years: number; cut: boolean; since: string | null; capped: boolean; firstYear: string | null };
/** SEC per-share values in older 10-Ks are not restated for later stock splits. When SEC DPS drops sharply but the
 *  split-adjusted payment history (calendar-year sums) did not, treat the drop as a split and rescale earlier years. */
export function adjustSplits(dps: Annual[], divs?: { ex: string; amt: number }[]): { rows: Annual[]; splits: string[] } {
  if (!divs?.length || dps.length < 2) return { rows: dps, splits: [] };
  const yr = (y: number) => divs.filter(d => +d.ex.slice(0, 4) === y).reduce((s, d) => s + d.amt, 0);
  const rows = dps.map(r => ({ ...r })); const splits: string[] = [];
  for (let i = rows.length - 1; i > 0; i--) {
    const r = rows[i].v / rows[i - 1].v;
    if (!(r > 0.15 && r < 0.75)) continue;
    const y1 = yr(+rows[i].end.slice(0, 4)), y0 = yr(+rows[i - 1].end.slice(0, 4));
    if (!(y0 > 0 && y1 >= y0 * 0.97)) continue; // the adjusted history shows no cut: it was a split
    const f = r / (y1 / y0);
    for (let j = 0; j < i; j++) rows[j].v *= f;
    splits.push(rows[i].end.slice(0, 4));
  }
  return { rows, splits };
}
/** Consecutive fiscal years of DPS increases counting back from the latest year. */
export function growthStreak(dps: Annual[]): Streak {
  const s = dps.filter(d => d.v > 0);
  if (s.length < 2) return { years: 0, cut: false, since: null, capped: false, firstYear: s[0]?.end.slice(0, 4) ?? null };
  let n = 0;
  for (let i = s.length - 1; i > 0; i--) { if (s[i].v > s[i - 1].v * 1.0005) n++; else break; }
  const cut = s.at(-1)!.v < s.at(-2)!.v * 0.995;
  return { years: n, cut, since: n ? s[s.length - 1 - n].end.slice(0, 4) : null, capped: n === s.length - 1, firstYear: s[0].end.slice(0, 4) };
}
const at = (rows: Annual[], end: string) => rows.find(r => Math.abs(Date.parse(r.end) - Date.parse(end)) < 20 * 864e5)?.v;
export type Ratio = { value: number | null; num: number | null; den: number | null; years: string; note?: string };
export type Safety = {
  badge: Badge; reason: string; fy: string | null; end: string | null;
  earn: Ratio; fcf: Ratio; earn3: Ratio; fcf3: Ratio; streak: Streak; kind: 'stock' | 'reit' | 'bdc' | 'bank' | 'fund';
  latestDps: number | null; fcfLatest: number | null; splits?: string[]; dpsAdj?: Annual[];
};
const ratio = (num: number | null | undefined, den: number | null | undefined, years: string): Ratio =>
  ({ num: num ?? null, den: den ?? null, years, value: num != null && den != null && den > 0 ? num / den : null, note: den != null && den <= 0 ? 'not meaningful (≤ 0)' : undefined });
const p = (x: number) => `${Math.round(x * 100)}%`;
export function isReit(name: string) { return /realty|reit\b|properties|real estate/i.test(name); }

export function payoutSafety(sec: SecMetrics | null, opts: { type: 'stock' | 'fund'; name: string; divs?: { ex: string; amt: number }[] }): Safety {
  const empty: Ratio = { value: null, num: null, den: null, years: '' };
  const none = (reason: string, kind: Safety['kind'] = 'stock'): Safety => ({ badge: 'na', reason, fy: null, end: null, earn: empty, fcf: empty, earn3: empty, fcf3: empty, streak: { years: 0, cut: false, since: null, capped: false, firstYear: null }, kind, latestDps: null, fcfLatest: null });
  if (opts.type === 'fund') return none('n/a (fund): ETFs pass through the dividends of the stocks they hold, so a single payout ratio does not apply.', 'fund');
  if (!sec || !sec.fy || !sec.divPaid.length) return none('Not enough annual SEC data (dividends paid) to judge.');
  const kind: Safety['kind'] = sec.bdc ? 'bdc' : (sec as any).bank ? 'bank' : isReit(opts.name) ? 'reit' : 'stock';
  const end = sec.divPaid.at(-1)!.end;
  const fyLabel = `FY${end.slice(0, 4)}`;
  const div = at(sec.divPaid, end), ni = at(sec.netIncome, end), ocf = at(sec.ocf, end), cx = at(sec.capex, end) ?? (sec.capex.length ? undefined : 0);
  const fcfL = ocf != null && cx != null ? ocf - cx : null;
  const earn = ratio(div, ni, fyLabel), fcf = ratio(div, fcfL, fyLabel);
  // 3-year sums smooth one-off swings
  const ends = sec.divPaid.slice(-3).map(r => r.end);
  const sum = (rows: Annual[]) => { const v = ends.map(e => at(rows, e)); return v.every(x => x != null) ? (v as number[]).reduce((a, b) => a + b, 0) : null; };
  const cxSum = sec.capex.length ? sum(sec.capex) : 0;
  const ocfSum = sum(sec.ocf);
  const yrs = `FY${ends[0].slice(0, 4)}–${end.slice(2, 4)}`;
  const earn3 = ends.length === 3 ? ratio(sum(sec.divPaid), sum(sec.netIncome), yrs) : empty;
  const fcf3 = ends.length === 3 ? ratio(sum(sec.divPaid), ocfSum != null && cxSum != null ? ocfSum - cxSum : null, yrs) : empty;
  if (!sec.capex.length) { fcf.note = 'no capex tag reported; FCF = operating cash flow'; fcf3.note = fcf.note; }
  const adj = adjustSplits(sec.dps, opts.divs);
  const streak = growthStreak(adj.rows);
  const latestDps = sec.dps.at(-1)?.v ?? null;
  const base = { splits: adj.splits, dpsAdj: adj.rows, fy: fyLabel, end, earn, fcf, earn3, fcf3, streak, kind, latestDps, fcfLatest: fcfL };
  const e = earn3.value ?? earn.value, f = fcf3.value ?? fcf.value;
  const eTxt = e != null ? `${p(e)} of earnings` : null, fTxt = f != null ? `${p(f)} of free cash flow` : null;
  const span = earn3.value != null || fcf3.value != null ? yrs : fyLabel;
  if (streak.cut) return { ...base, badge: 'red', reason: `The dividend per share fell in ${fyLabel} versus the prior year. Payouts took ${[eTxt, fTxt].filter(Boolean).join(' and ')} (${span}).` };
  if (kind === 'bdc') {
    if (e == null) return { ...base, badge: 'na', reason: 'BDC: SEC standard tags lack net investment income, and operating cash flow includes loan purchases, so ratios are not meaningful.' };
    const b: Badge = e > 1.1 ? 'red' : e > 0.9 ? 'amber' : 'green';
    return { ...base, badge: b, reason: `BDC: dividends were ${p(e)} of net increase in net assets from operations (${span}). BDCs must distribute ~90% of taxable income, so high payouts are normal; FCF is not meaningful because loan purchases run through operating cash flow.` };
  }
  if (kind === 'bank') {
    if (e == null) return { ...base, badge: 'na', reason: 'Bank: not enough earnings data to judge.' };
    const b: Badge = (earn3.den ?? earn.den ?? 1) <= 0 || e > 1 ? 'red' : e > 0.6 ? 'amber' : 'green';
    return { ...base, badge: b, reason: `Bank: dividends took ${p(e)} of earnings (${span}). Free cash flow is not meaningful for banks because lending and deposits run through operating cash flow, so earnings are the guide.${streak.years ? ` Dividend raised ${streak.years} year${streak.years > 1 ? 's' : ''} in a row${streak.capped ? ' (all years in SEC data)' : ''}.` : ''}` };
  }
  if (kind === 'reit') {
    if (f == null) return { ...base, badge: 'na', reason: 'REIT: not enough cash-flow data to judge.' };
    const b: Badge = f > 1 ? 'red' : f > 0.85 ? 'amber' : 'green';
    return { ...base, badge: b, reason: `REIT: dividends took ${p(f)} of operating cash flow less capex (${span}). REITs must pay out 90% of taxable income and GAAP earnings are cut by depreciation, so the earnings ratio${e != null ? ` (${p(e)})` : ''} overstates risk; cash flow is the better guide.` };
  }
  const negE = (earn3.den ?? earn.den ?? 1) <= 0, negF = (fcf3.den ?? fcf.den ?? 1) <= 0;
  if (negE && negF) return { ...base, badge: 'red', reason: `Both earnings and free cash flow were negative (${span}); the dividend is not being covered.` };
  if (negE || negF) return { ...base, badge: 'red', reason: `${negE ? 'Earnings' : 'Free cash flow'} were negative (${span}), so the dividend was not covered by ${negE ? 'profits' : 'cash generation'}${(negE ? fTxt : eTxt) ? `; it took ${negE ? fTxt : eTxt}` : ''}.` };
  const vals = [e, f].filter((x): x is number => x != null);
  if (!vals.length) return { ...base, badge: 'na', reason: 'Not enough SEC data to compute a payout ratio.' };
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const both = [eTxt, fTxt].filter(Boolean).join(' and ');
  const streakTxt = streak.years ? ` Dividend raised ${streak.years} year${streak.years > 1 ? 's' : ''} in a row${streak.capped ? ' (all years in SEC data)' : ''}.` : '';
  if (hi > 1 && lo > 1) return { ...base, badge: 'red', reason: `Dividends took ${both} (${span}): more than the company earned and generated in cash.${streakTxt}` };
  if (hi > 1) return { ...base, badge: 'amber', reason: `Dividends took ${both} (${span}). One measure is above 100%, so coverage is thin even though the other looks fine.${streakTxt}` };
  if (hi > 0.75) return { ...base, badge: 'amber', reason: `Dividends took ${both} (${span}). Covered, but with little room for a bad year.${streakTxt}` };
  if (!streak.years && vals.length) return { ...base, badge: 'amber', reason: `Dividends took ${both} (${span}), comfortably covered, but the dividend per share was not raised in ${fyLabel}.` };
  return { ...base, badge: 'green', reason: `Dividends took ${both} (${span}), leaving a healthy cushion.${streakTxt}` };
}

// Forward dividend projection: next-12-month payments per holding, annual income, calendar buckets.
import type { Div, Holding, Lag, ManualDiv, TickerData } from './types';
const DAY = 864e5;
export const parseD = (s: string) => Date.parse(s + 'T00:00:00Z');
export const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addYears = (s: string, k: number) => { const [y, m, d] = s.split('-').map(Number); const t = Date.UTC(y + k, m - 1, d); return fmtD(new Date(t).getUTCMonth() !== m - 1 ? Date.UTC(y + k, m, 0) : t); };
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Payments per year from the median of the most recent gaps between regular ex-dates. Snaps to 1/2/4/12. */
export function detectFrequency(divs: Div[], today: string): 0 | 1 | 2 | 4 | 12 {
  const recent = regular(divs.filter(d => parseD(d.ex) <= parseD(today) + 120 * DAY)).slice(-6);
  if (!recent.length) return 0;
  if (recent.length === 1) return 1;
  const gaps = recent.slice(1).map((d, i) => (parseD(d.ex) - parseD(recent[i].ex)) / DAY);
  return snap(365 / median(gaps));
}
const snap = (per: number) => ([1, 2, 4, 12] as const).reduce((b, o) => (Math.abs(Math.log(per / o)) < Math.abs(Math.log(per / b)) ? o : b), 4 as 1 | 2 | 4 | 12);
/** Drop special/supplemental dividends: amounts far above the local median, and extra payments that fall between two regular ones. */
export function regular(divs: Div[]): Div[] {
  if (divs.length < 3) return divs;
  const a = divs.filter((d, i) => d.amt <= median(divs.slice(Math.max(0, i - 6), i + 7).map(x => x.amt)) * 1.75);
  if (a.length < 4) return a;
  const gaps = a.slice(1).map((d, i) => (parseD(d.ex) - parseD(a[i].ex)) / DAY);
  const out: Div[] = [];
  for (let i = 0; i < a.length; i++) {
    const last = out.at(-1);
    if (last) {
      const g = median(gaps.slice(Math.max(0, i - 4), i + 3));
      if ((parseD(a[i].ex) - parseD(last.ex)) / DAY < g * 0.6) {
        const m = median(a.slice(Math.max(0, i - 6), i + 7).map(x => x.amt));
        if (Math.abs(a[i].amt - m) < Math.abs(last.amt - m)) out[out.length - 1] = a[i];
        continue;
      }
    }
    out.push(a[i]);
  }
  return out;
}
export function payLag(t: TickerData, lag?: Lag): { days: number; known: boolean } {
  const known = t.divs.filter(d => d.pay).map(d => (parseD(d.pay!) - parseD(d.ex)) / DAY).filter(x => x >= 0 && x < 120);
  if (known.length) return { days: Math.round(median(known.slice(-8))), known: true };
  const def = t.type === 'fund' ? lag?.fund : lag?.stock;
  return { days: def ?? (t.type === 'fund' ? 5 : 14), known: false };
}
export type Payment = { ticker: string; holdingId: string; ex: string | null; pay: string; perShare: number; amount: number; est: boolean; status: 'declared' | 'projected' | 'manual'; drip: boolean };
export type Projection = { payments: Payment[]; dpsAnnual: number; freq: number; method: string; specialsExcluded: boolean; changed?: boolean };

/** Next 12 months of payments (window [today, today+365)) for one holding. */
export function projectHolding(h: Holding, t: TickerData | undefined, today: string, lag?: Lag): Projection {
  const end = parseD(addYears(today, 1)); const t0 = parseD(today);
  if (h.manual && h.manual.amount > 0) return manualProjection(h, h.manual, today);
  if (!t || !t.divs.length) return { payments: [], dpsAnnual: 0, freq: 0, method: 'no dividend data', specialsExcluded: false };
  const freq = detectFrequency(t.divs, today);
  const reg = regular(t.divs);
  const specialsExcluded = freq > 0 && t.divs.slice(-(freq * 2 + 2)).some(d => !reg.includes(d));
  // stale: no payment in ~2 normal periods => treat as suspended
  const last = reg.at(-1)!;
  if (freq === 0 || parseD(last.ex) < t0 - Math.max(400, (730 / freq)) * DAY) return { payments: [], dpsAnnual: 0, freq, method: `no dividend since ${last.ex}`, specialsExcluded };
  // Template year = last `freq` regular payments. If the payout frequency changed recently (fewer than `freq`
  // payments at the new cadence), fill the year at the new cadence using the recent amounts.
  const gapNew = 365 / freq;
  let run = 1;
  for (let i = reg.length - 1; i > 0 && run < freq; i--) { const g = (parseD(reg[i].ex) - parseD(reg[i - 1].ex)) / DAY; if (g > gapNew * 0.6 && g < gapNew * 1.6) run++; else break; }
  const changed = run < freq && reg.length > run;
  let template: Div[] = reg.slice(-freq);
  if (changed) {
    const recent = reg.slice(-Math.max(1, run - 1)); const avg = recent.reduce((s2, d) => s2 + d.amt, 0) / recent.length;
    template = [...recent];
    for (let k = 1; template.length < freq; k++) template.unshift({ ex: fmtD(parseD(recent[0].ex) - k * gapNew * DAY), amt: avg });
  }
  const { days } = payLag(t, lag);
  const fund = t.type === 'fund';
  const latestAmt = last.amt;
  const payments: Payment[] = [];
  // already-announced: in the bundled history with a pay date on/after today, including any non-regular declared payment
  for (const d of t.divs) {
    const pay = d.pay ?? fmtD(parseD(d.ex) + days * DAY);
    if (parseD(pay) >= t0 && parseD(pay) < end && (parseD(d.ex) >= t0 - 60 * DAY)) {
      payments.push({ ticker: h.ticker, holdingId: h.id, ex: d.ex, pay, perShare: d.amt, amount: d.amt * h.shares, est: !d.pay, status: 'declared', drip: h.drip });
    }
  }
  for (const d of template) {
    for (let k = 1; k <= 2; k++) {
      const ex = addYears(d.ex, k);
      const pay = d.pay ? addYears(d.pay, k) : fmtD(parseD(ex) + days * DAY);
      if (parseD(pay) < t0 || parseD(pay) >= end) continue;
      // skip if an announced payment already covers this slot (within 20 days)
      if (payments.some(p => p.status === 'declared' && Math.abs(parseD(p.pay) - parseD(pay)) < Math.min(20, 365 / freq / 2) * DAY)) continue;
      const per = fund ? d.amt : latestAmt;
      payments.push({ ticker: h.ticker, holdingId: h.id, ex, pay, perShare: per, amount: per * h.shares, est: true, status: 'projected', drip: h.drip });
    }
  }
  payments.sort((a, b) => a.pay.localeCompare(b.pay));
  const dpsAnnual = payments.reduce((s, p) => s + p.perShare, 0);
  const method = (changed ? `payout frequency changed recently; ` : '') + (fund ? `${freq}×/yr; next 12 months repeat the last 12 months' distributions` : `${freq}×/yr at the latest regular rate $${latestAmt.toFixed(4).replace(/0{1,2}$/, '')}`);
  return { payments, dpsAnnual, freq, method, specialsExcluded, changed };
}
export function manualProjection(h: Holding, m: ManualDiv, today: string): Projection {
  const [y, mo] = today.split('-').map(Number);
  const t0 = parseD(today);
  const months = (m.months.length ? m.months : defaultMonths(m.freq)).slice(0, m.freq);
  const payments: Payment[] = [];
  for (let i = 0; i < 13; i++) {
    const mm = ((mo - 1 + i) % 12) + 1, yy = y + Math.floor((mo - 1 + i) / 12);
    if (!months.includes(mm)) continue;
    const pay = fmtD(Date.UTC(yy, mm - 1, 15));
    if (parseD(pay) < t0 || parseD(pay) >= parseD(addYears(today, 1))) continue;
    payments.push({ ticker: h.ticker, holdingId: h.id, ex: null, pay, perShare: m.amount, amount: m.amount * h.shares, est: true, status: 'manual', drip: h.drip });
  }
  return { payments, dpsAnnual: m.amount * m.freq, freq: m.freq, method: `manual: $${m.amount} × ${m.freq}/yr`, specialsExcluded: false };
}
export const defaultMonths = (f: number) => (f === 12 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : f === 4 ? [3, 6, 9, 12] : f === 2 ? [6, 12] : [12]);

export type HoldingIncome = { h: Holding; t?: TickerData; proj: Projection; annual: number; value: number; yieldPct: number | null; yoc: number | null };
export function portfolioIncome(holdings: Holding[], data: Record<string, TickerData>, today: string, lag?: Lag) {
  const rows: HoldingIncome[] = holdings.map(h => {
    const t = data[h.ticker];
    const proj = projectHolding(h, t, today, lag);
    const annual = proj.payments.reduce((s, p) => s + p.amount, 0);
    const price = t?.price ?? null;
    return { h, t, proj, annual, value: price ? price * h.shares : 0, yieldPct: price && proj.dpsAnnual ? proj.dpsAnnual / price : null, yoc: h.cost > 0 && annual ? annual / h.cost : null };
  });
  const total = rows.reduce((s, r) => s + r.annual, 0);
  const reinvested = rows.filter(r => r.h.drip).reduce((s, r) => s + r.annual, 0);
  const value = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total, reinvested, cash: total - reinvested, value, yieldPct: value ? total / value : null };
}
/** 12 month-of-year buckets starting with today's month, covering exactly the window [today, today+1y).
 *  The current month's bucket therefore holds the rest of this month plus the start of the same month next year. */
export function calendar(payments: Payment[], today: string) {
  const [y, m] = today.split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const mm = ((m - 1 + i) % 12) + 1, yy = y + Math.floor((m - 1 + i) / 12); return { key: `${yy}-${String(mm).padStart(2, '0')}`, y: yy, m: mm, total: 0, items: [] as Payment[], years: [] as number[] }; });
  for (const p of payments) { const b = months.find(x => x.m === +p.pay.slice(5, 7)); if (b) { b.items.push(p); b.total += p.amount; } }
  months.forEach(b => { b.items.sort((a, c) => a.pay.localeCompare(c.pay)); b.years = [...new Set(b.items.map(p => +p.pay.slice(0, 4)))]; });
  const total = months.reduce((s, b) => s + b.total, 0);
  const next = [...payments].filter(p => p.pay >= today).sort((a, b) => a.pay.localeCompare(b.pay))[0];
  const nextDays = next ? Math.round((parseD(next.pay) - parseD(today)) / DAY) : null;
  const nextGroup = next ? payments.filter(p => p.pay === next.pay) : [];
  return { months, total, monthlyAvg: total / 12, next, nextDays, nextGroup };
}

export function money(v: number, cents = true): string {
  const a = Math.abs(v); const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 2)}M`;
  if (a >= 1e4 || !cents) return `${s}$${Math.round(a).toLocaleString('en-US')}`;
  return `${s}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const pct = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
export const dps = (v: number) => '$' + v.toFixed(4).replace(/(\.\d\d\d*?)0+$/, '$1');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monShort = (m: number) => MON[m - 1];
export const dateShort = (s: string) => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
export const dateLong = (s: string) => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}`;
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

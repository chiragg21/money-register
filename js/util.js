export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
export const round2 = (n) => Math.round(num(n) * 100) / 100;

export function money(n) {
  const v = round2(n);
  return (v < 0 ? '−' : '') + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
export const moneySigned = (n, dir) => (dir === 'out' ? '−' : '+') + money(Math.abs(n));

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const todayISO = () => toISO(new Date());
export function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, dim));
  return toISO(t);
}
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const fmtDate = (iso) => parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDay = (iso) => parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const monthKey = (iso) => iso.slice(0, 7);
export function monthLabel(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); }
export function shiftMonth(key, n) { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
export function relDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// Shared UI building blocks.
import { esc, money, fmtDate, num, todayISO } from './util.js';
import { ui } from './core.js';
import { S, activeScope, defaultOwnerId, ownerName, getOrCreateAccount } from './store.js';
import { KINDS, personName, refLabel, txnClass, PERIODS } from './engine.js';

const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM17 14.5h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  loan: 'M7 17L17 7M8 7h9v9',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  cycle: 'M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M21 4v5h-5M3 20v-5h5',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  menu: 'M4 6h16M4 12h16M4 18h16', more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  back: 'M15 18l-6-6 6-6', chev: 'M9 18l6-6-6-6',
  down: 'M12 5v14M19 12l-7 7-7-7', up: 'M12 19V5M5 12l7-7 7 7',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  calc: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;

export const NAV = [
  { id: 'home', label: 'Home', icon: 'home' }, { id: 'cash', label: 'Cash & accounts', icon: 'wallet' },
  { id: 'loans', label: 'Loans', icon: 'loan' }, { id: 'income', label: 'Regular income', icon: 'calendar' },
  { id: 'committees', label: 'Committees', icon: 'cycle' }, { id: 'people', label: 'People', icon: 'users' }
];
export const addBtn = (sheet, extra = '') => `<button class="iconbtn" data-act="sheet" data-sheet="${sheet}" ${extra} aria-label="Add">${icon('plus')}</button>`;
export const moreBtn = (kind, id) => `<button class="iconbtn" data-act="sheet" data-sheet="entityMenu" data-kind="${kind}" data-id="${id}" aria-label="More">${icon('more')}</button>`;

/* ---------- whose money ---------- */
export const multiOwner = () => S.owners.length > 1;
export const ownerTag = (id) => (multiOwner() && activeScope() === 'all' && id ? `<span class="tag">${esc(ownerName(id))}</span>` : '');
export function ownerField(selected, label = 'Whose is this?') {
  const sid = selected || defaultOwnerId();
  if (!multiOwner()) return `<input type="hidden" name="ownerId" value="${esc(sid)}">`;
  return field(label, sel('ownerId', S.owners.map(o => ({ v: o.id, l: o.name })), sid));
}
export function whoSwitcher() {
  const cur = activeScope();
  return `<div class="who"><label>Showing money of</label><select data-input="scopeSel">
    <option value="all" ${cur === 'all' ? 'selected' : ''}>${multiOwner() ? 'Everyone' : 'Me'}</option>
    ${multiOwner() ? S.owners.map(o => `<option value="${o.id}" ${cur === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('') : ''}
    <option value="__add">+ Add family member…</option></select></div>`;
}

/* ---------- collapsible bits ---------- */
export const moreOptions = (html, label = 'More options') => `<details class="more"><summary>${label}</summary><div class="in">${html}</div></details>`;
export const fold = (key, title, html) => `<details class="fold" data-keep="${key}" ${require_open(key) ? 'open' : ''}><summary>${title}</summary><div class="in">${html}</div></details>`;
const require_open = (k) => !!ui.open[k];

/* ---------- form controls ---------- */
export function field(label, control, hint = '') {
  return `<label class="field"><span class="flabel">${label}</span>${control}${hint ? `<span class="fhint">${hint}</span>` : ''}</label>`;
}
export function inp(name, o = {}) {
  const { type = 'text', value = '', ph = '', req = false, extra = '', min } = o;
  const num_ = type === 'number';
  return `<input name="${name}" type="${type}" value="${esc(value)}" ${ph ? `placeholder="${esc(ph)}"` : ''} ${req ? 'required' : ''} ${num_ ? 'step="any" inputmode="decimal"' : ''} ${min != null ? `min="${min}"` : ''} ${extra}>`;
}
export function sel(name, options, selected, extra = '') {
  return `<select name="${name}" ${extra}>${options.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(selected) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
}
export function accountSelect(name = 'accountId', selected, { allowNone = true, label = 'Account', noneLabel = "Don't change my cash" } = {}) {
  const sid = selected === undefined ? S.settings.defaultAccountId : selected;
  const opts = S.accounts.map(a => ({ v: a.id, l: a.name }));
  if (allowNone) opts.push({ v: '', l: noneLabel });
  opts.push({ v: '__new', l: '+ Add a new account…' });
  return field(label, sel(name, opts, sid, 'data-input="acctSel"')) +
    `<div class="hidden" data-newacct>${field('Name of the new account', inp('newAccount', { ph: 'e.g. SBI bank, Locker, Paytm wallet' }))}</div>`;
}
// returns account id, null (no account) or undefined (new account name missing)
export function resolveAcct(fd) {
  if (fd.accountId === '__new') { const id = getOrCreateAccount(fd.newAccount); return id || undefined; }
  return fd.accountId || null;
}
export function personInput(name = 'person', value = '', { req = true, label = 'Person', ph = 'Name' } = {}) {
  return field(label, inp(name, { value, ph, req, extra: 'list="people-dl"' })) +
    `<datalist id="people-dl">${S.people.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>`;
}
export function periodFields(o = {}) {
  const per = o.period || 'monthly';
  return field('How often', sel('period', Object.entries(PERIODS).map(([k, v]) => ({ v: k, l: v.label })), per, 'data-input="period"')) +
    `<div id="custom-days" class="${per === 'custom' ? '' : 'hidden'}">${field('Number of days', inp('customDays', { type: 'number', value: o.customDays || '' }))}</div>`;
}
export const groupField = (value = '') => field('Group / label (optional)', inp('group', { value, ph: 'e.g. Tuition batch 2026', extra: 'list="groups-dl"' })) +
  `<datalist id="groups-dl">${[...new Set([...S.loans, ...S.incomes].map(x => x.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;

/* ---------- display blocks ---------- */
export const pill = (t, tone = 'plain') => `<span class="pill ${tone}">${esc(t)}</span>`;
export const section = (title, right = '') => `<div class="section"><h2>${esc(title)}</h2>${right}</div>`;
export const kv = (k, v, cls = '') => `<div class="kv"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
export const empty = (t) => `<div class="empty">${t}</div>`;
export const stat = (lbl, val, sub = '', cls = '') => `<div class="stat"><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
export const toneFor = (n) => (n > 0 ? 'neg' : 'pos');

export function accountName(id) { const a = S.accounts.find(x => x.id === id); return a ? a.name : null; }

export function txnTitle(t) {
  const who = personName(S, t.personId); const ref = refLabel(S, t.refId);
  const rn = t.round ? ` · Round ${t.round}` : '';
  switch (t.kind) {
    case 'interest': return t.dir === 'in' ? `Interest from ${who || ref}` : `Interest paid to ${who || ref}`;
    case 'income': return who || ref ? `Received from ${ref || who}` : (t.note ? 'Income' : 'Income');
    case 'lend': return `Loan given to ${who || ref}`;
    case 'lend_back': return `Loan returned by ${who || ref}`;
    case 'borrow': return `Borrowed from ${who || ref}`;
    case 'borrow_back': return `Repaid to ${who || ref}`;
    case 'chit_pay': return `${ref} installment${rn}`;
    case 'chit_win': return `${ref} pot received${rn}`;
    case 'chit_collect': return `${who} · ${ref}${rn}`;
    case 'chit_payout': return `${ref} pot paid to ${who || 'winner'}${rn}`;
    case 'transfer': return t.dir === 'out' ? `Transfer to ${accountName(t.pairAccount) || 'account'}` : `Transfer from ${accountName(t.pairAccount) || 'account'}`;
    case 'expense': return who ? `Expense · ${who}` : 'Expense';
    case 'in_other': return who ? `Money from ${who}` : 'Money added';
    case 'out_other': return who ? `Money to ${who}` : 'Money taken out';
    default: return (KINDS[t.kind] || {}).label || 'Entry';
  }
}
export function txnRow(t, { showAccount = true } = {}) {
  const cls = txnClass(t);
  const tone = t.kind === 'transfer' || t.kind === 'adjust' ? 'neutral' : (cls === 'capital' ? 'gold' : t.dir === 'in' ? 'in' : 'out');
  const acc = t.accountId ? accountName(t.accountId) : null;
  const meta = [fmtDate(t.date), showAccount ? (acc || 'cash not changed') : null, t.note].filter(Boolean).join(' · ');
  return `<div class="item" data-act="sheet" data-sheet="txnEdit" data-id="${t.id}">
    <div class="bubble ${tone}">${icon(t.dir === 'in' ? 'down' : 'up')}</div>
    <div class="main-col"><div class="t">${esc(txnTitle(t))}${ownerTag(t.ownerId)}</div><div class="s">${esc(meta)}</div></div>
    <div class="r ${t.dir === 'in' ? 'pos' : 'neg'}">${t.dir === 'in' ? '+' : '−'}${money(t.amount)}</div></div>`;
}
export function txnList(list, opts = {}) {
  if (!list.length) return `<div class="list">${empty(opts.emptyText || 'No transactions yet.')}</div>`;
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  let html = '', last = '';
  sorted.forEach(t => { if (opts.group && t.date !== last) { html += `<div class="datehead">${fmtDate(t.date)}</div>`; last = t.date; } html += txnRow(t, opts); });
  return `<div class="list">${html}</div>`;
}
export const waLink = (phone, text) => {
  let p = String(phone || '').replace(/\D/g, ''); if (p.length === 10) p = '91' + p;
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : '';
};
export { money, num, todayISO };

// State, persistence, legacy (v1) migration.
import { uid, num, todayISO } from './util.js';

const KEY = 'money-register-v2';
export let S = null;
export let storageOk = true;

export function blank() {
  return {
    v: 3,
    settings: { defaultAccountId: 'acc_cash', onboarded: false, lastBackup: null, pinHash: null, pinSalt: null },
    owners: [{ id: 'o_me', name: 'Me', other: 0 }],
    accounts: [{ id: 'acc_cash', name: 'Cash at home', type: 'cash' }],
    people: [], loans: [], incomes: [], committees: [], txns: []
  };
}
function normalize(d) {
  const b = blank();
  const o = Object.assign(b, d);
  o.v = 3;
  o.settings = Object.assign(b.settings, d.settings || {});
  ['owners', 'accounts', 'people', 'loans', 'incomes', 'committees', 'txns'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
  if (!o.owners.length) o.owners = blank().owners;
  o.owners.forEach(w => { w.other = Number(w.other) || 0; });
  if (!o.accounts.length) o.accounts = blank().accounts;
  if (!o.accounts.find(a => a.id === o.settings.defaultAccountId)) o.settings.defaultAccountId = o.accounts[0].id;
  const me = o.owners[0].id, known = new Set(o.owners.map(w => w.id));
  // v2 stored a starting balance on the account; it is now an ordinary "opening" entry
  o.accounts.forEach(a => {
    if (Number(a.opening)) o.txns.push({ id: uid('t'), date: todayISO(), dir: a.opening > 0 ? 'in' : 'out', amount: Math.abs(Number(a.opening)), accountId: a.id, kind: 'opening', note: 'Opening balance', ownerId: me, createdAt: 0 });
    delete a.opening;
  });
  const ownerOfRef = {};
  [o.loans, o.incomes, o.committees].forEach(list => list.forEach(e => { if (!known.has(e.ownerId)) e.ownerId = me; ownerOfRef[e.id] = e.ownerId; }));
  o.txns.forEach(t => { if (!known.has(t.ownerId)) t.ownerId = ownerOfRef[t.refId] || me; });
  return o;
}
export function setState(d) { S = normalize(d); save(); }

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
  if (raw) {
    try { S = normalize(JSON.parse(raw)); return { fresh: false }; }
    catch (e) { try { localStorage.setItem(KEY + '-corrupt-' + Date.now(), raw); } catch (_) { } }
  }
  S = blank();
  const migrated = migrateV1();
  save();
  return { fresh: true, migrated };
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
  catch (e) { storageOk = false; }
  return storageOk;
}
export const snapshot = () => JSON.stringify(S);
export function restore(snap) { S = normalize(JSON.parse(snap)); save(); }

/* ---------- helpers ---------- */
export function getOrCreatePerson(name, extra = {}) {
  name = String(name || '').trim(); if (!name) return null;
  let p = S.people.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) { p = Object.assign({ id: uid('p'), name, phone: '', note: '' }, extra); S.people.push(p); }
  return p.id;
}
export function addTxn(t) {
  const ref = t.refId && [...S.loans, ...S.incomes, ...S.committees].find(e => e.id === t.refId);
  const x = Object.assign({ id: uid('t'), date: todayISO(), accountId: null, note: '', createdAt: Date.now() }, t, { amount: num(t.amount) });
  x.ownerId = t.ownerId || (ref && ref.ownerId) || defaultOwnerId();
  S.txns.push(x); return x;
}
export function getOrCreateAccount(name, type = 'cash') {
  name = String(name || '').trim(); if (!name) return null;
  let a = S.accounts.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!a) { a = { id: uid('acc'), name, type }; S.accounts.push(a); }
  return a.id;
}

/* ---------- whose money: owners & the "viewing" filter ---------- */
const SCOPE_KEY = 'mr-owner';
export const scope = { owner: 'all' };
try { scope.owner = localStorage.getItem(SCOPE_KEY) || 'all'; } catch (e) { }
export function setScope(id) { scope.owner = id; try { localStorage.setItem(SCOPE_KEY, id); } catch (e) { } }
export const activeScope = () => (scope.owner !== 'all' && S.owners.some(o => o.id === scope.owner) ? scope.owner : 'all');
export const defaultOwnerId = () => (activeScope() !== 'all' ? scope.owner : S.owners[0].id);
export const ownerName = (id) => (S.owners.find(o => o.id === id) || {}).name || '';
export function scopedFor(id) {
  if (!id || id === 'all') return S;
  const k = (e) => e.ownerId === id;
  return Object.assign({}, S, { owners: S.owners.filter(o => o.id === id), loans: S.loans.filter(k), incomes: S.incomes.filter(k), committees: S.committees.filter(k), txns: S.txns.filter(k) });
}
export const V = () => scopedFor(activeScope());

export function usedGroups() {
  const g = new Set(); [...S.loans, ...S.incomes].forEach(x => x.group && g.add(x.group)); return [...g].sort();
}

/* ---------- v1 migration ---------- */
export function importLegacyEntries(entries, group) {
  let n = 0;
  (entries || []).forEach(e => {
    if (!e || !e.name) return;
    const personId = getOrCreatePerson(e.name);
    const base = {
      id: uid(e.principal ? 'l' : 'i'), personId, ownerId: S.owners[0].id, amount: num(e.recurringAmount), period: e.periodType || 'monthly',
      customDays: e.customDays || '', start: e.startDate || todayISO(), timing: e.paymentTiming === 'end' ? 'end' : 'start',
      manualDue: num(e.manualDue), frozen: !!e.frozen, frozenDate: e.frozenDate || null, group: group || '', note: '',
      configHistory: (e.configHistory || []).map(h => ({ effectiveTo: h.effectiveTo, amount: num(h.recurringAmount) }))
    };
    const isLoan = num(e.principal) > 0;
    const pay = (p) => ({ id: uid('t'), date: p.date || todayISO(), dir: 'in', amount: num(p.amount), accountId: null, ownerId: base.ownerId, kind: isLoan ? 'interest' : 'income', personId, refId: base.id, forPeriod: p.forPeriod || null, note: 'Imported from old register', createdAt: Date.now() });
    if (isLoan) S.loans.push(Object.assign(base, { dir: 'lent', principal: num(e.principal), rate: e.rateValue === '' || e.rateValue == null ? '' : num(e.rateValue), dueDate: '' }));
    else S.incomes.push(Object.assign(base, { title: '' }));
    (e.receivedEntries || []).forEach(p => S.txns.push(pay(p)));
    if (isLoan && num(e.principalReturned) > 0)
      S.txns.push({ id: uid('t'), date: todayISO(), dir: 'in', amount: num(e.principalReturned), accountId: null, ownerId: base.ownerId, kind: 'lend_back', personId, refId: base.id, note: 'Imported from old register', createdAt: Date.now() });
    n++;
  });
  return n;
}
function migrateV1() {
  let count = 0;
  try {
    const nbs = JSON.parse(localStorage.getItem('money-register-notebooks-v1') || 'null');
    if (Array.isArray(nbs)) nbs.forEach(nb => {
      let raw = []; try { raw = JSON.parse(localStorage.getItem('money-register-data-' + nb.id) || '[]'); } catch (e) { }
      count += importLegacyEntries(raw, nb.name);
    });
    else {
      const legacy = JSON.parse(localStorage.getItem('hisab-entries-v1') || 'null');
      if (Array.isArray(legacy)) count += importLegacyEntries(legacy, 'My Register');
    }
  } catch (e) { }
  return count;
}

/* ---------- PIN ---------- */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) | 0; return String(h);
}

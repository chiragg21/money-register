// All forms (bottom sheets) and the actions behind them.
import { sheets, actions, inputs, openSheet, closeSheet, commit, toast, confirmDlg, ui, go } from './core.js';
import { S, save, addTxn, getOrCreatePerson, snapshot, restore, V, scopedFor, activeScope, defaultOwnerId, ownerName, getOrCreateAccount } from './store.js';
import { uid, esc, num, round2, money, todayISO, fmtDate } from './util.js';
import { dueDates, loanFigures, scheduleFigures, chitFigures, chitRound, chitSlots, personName, person, accountBalance, cutoff, summary } from './engine.js';
import { field, inp, sel, accountSelect, resolveAcct, ownerField, personInput, periodFields, groupField, moreOptions, icon, waLink } from './kit.js';

const done = () => commit(save);
const find = (list, id) => S[list].find(x => x.id === id);
const withUndo = (msg, fn) => { const snap = snapshot(); fn(); commit(save); toast(msg, () => { restore(snap); commit(() => { }); }); };
const needAcct = (a) => { if (a === undefined) { toast('Type a name for the new account'); return true; } return false; };
const amountField = (name = 'amount', value = '', label = 'Amount (₹)') => `<div class="amt">${field(label, inp(name, { type: 'number', value, req: true, min: 0, extra: 'placeholder="0"' }))}</div>`;

/* ---------- small shared handlers ---------- */
inputs.acctSel = (el) => { const box = el.closest('.field').nextElementSibling; if (box && box.hasAttribute('data-newacct')) box.classList.toggle('hidden', el.value !== '__new'); };
inputs.period = (el) => { const w = el.form.querySelector('#custom-days'); if (w) w.classList.toggle('hidden', el.value !== 'custom'); };
inputs.role = (el) => { const org = el.value === 'organizer'; el.form.querySelectorAll('[data-role]').forEach(n => n.classList.toggle('hidden', n.dataset.role !== (org ? 'organizer' : 'member'))); };

/* ---------- first run ---------- */
sheets.welcome = {
  title: 'Welcome 👋', submit_label: () => 'Get started', noCancel: true,
  body: (p) => `<p class="muted">${p.migrated ? `We brought over <b>${p.migrated}</b> entries from your old Money Register. ` : ''}Everything is saved on this device only. Tell us what you hold right now — you can change it any time.</p>
    ${amountField('cash', '', 'Cash at home right now (₹)').replace(' required', '')}
    ${field('Money in a bank account (₹, optional)', inp('bank', { type: 'number', ph: '0' }), 'We\'ll create a "Bank account" for it. You can add more accounts later from any “Account” dropdown.')}`,
  submit(fd) {
    const me = defaultOwnerId(), mk = (accountId, amt) => num(amt) > 0 && addTxn({ date: todayISO(), dir: 'in', amount: amt, accountId, kind: 'opening', note: 'Opening balance', ownerId: me });
    mk(S.accounts[0].id, fd.cash);
    if (num(fd.bank) > 0) mk(getOrCreateAccount('Bank account', 'bank'), fd.bank);
    S.settings.onboarded = true; done();
  }
};

/* ---------- "more" menu from Home ---------- */
sheets.more = {
  title: 'Add something', raw: true,
  body: () => `<div class="list menu">${[
    ['transfer', 'swap', 'Move money between accounts'], ['count', 'calc', 'Count my cash'], ['income', 'calendar', 'New regular income (fees, rent…)'],
    ['committee', 'cycle', 'New committee'], ['account', 'wallet', 'New account (bank, locker, wallet…)'], ['person', 'user', 'New person']
  ].map(([sh, ic, l]) => `<div class="item" data-act="sheet" data-sheet="${sh}"><div class="bubble neutral">${icon(ic)}</div><div class="main-col"><div class="t">${l}</div></div></div>`).join('')}</div>`
};

/* ---------- money in / out ---------- */
sheets.money = {
  title: (p) => p.dir === 'in' ? 'Money in' : 'Money out',
  submit_label: () => 'Save',
  body: (p) => {
    const cats = p.dir === 'in' ? [{ v: 'income', l: 'Income (salary, fees, gift…)' }, { v: 'in_other', l: 'Not income (e.g. taken from bank)' }] : [{ v: 'expense', l: 'Spending (expense)' }, { v: 'out_other', l: 'Not spending (e.g. kept in bank)' }];
    return amountField() + accountSelect('accountId', S.settings.defaultAccountId, { allowNone: false, label: p.dir === 'in' ? 'Goes into' : 'Taken from' }) +
      field('Note (optional)', inp('note', { ph: p.dir === 'in' ? 'e.g. Salary' : 'e.g. Electricity bill' })) +
      moreOptions(field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) + field('Counts as', sel('kind', cats, cats[0].v)) +
        personInput('person', '', { req: false, label: p.dir === 'in' ? 'From whom (optional)' : 'To whom (optional)' }) + ownerField());
  },
  submit(fd, p) {
    if (num(fd.amount) <= 0) { toast('Enter an amount'); return false; }
    const acc = resolveAcct(fd); if (needAcct(acc)) return false;
    addTxn({ date: fd.date, dir: p.dir, amount: fd.amount, accountId: acc, kind: fd.kind, personId: getOrCreatePerson(fd.person), note: fd.note, ownerId: fd.ownerId });
    done(); toast('Saved');
  }
};

/* ---------- transfer ---------- */
sheets.transfer = {
  title: 'Move money between accounts',
  body: () => {
    const o = S.accounts.map(a => ({ v: a.id, l: `${a.name} (${money(accountBalance(V(), a.id))})` }));
    return amountField() + field('From', sel('from', o, S.accounts[0].id)) + field('To', sel('to', o, (S.accounts[1] || S.accounts[0]).id)) +
      moreOptions(field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) + field('Note', inp('note')) + ownerField());
  },
  submit(fd) {
    if (fd.from === fd.to) { toast('Pick two different accounts'); return false; }
    if (num(fd.amount) <= 0) { toast('Enter an amount'); return false; }
    const tid = uid('x');
    addTxn({ date: fd.date, dir: 'out', amount: fd.amount, accountId: fd.from, kind: 'transfer', tid, pairAccount: fd.to, note: fd.note, ownerId: fd.ownerId });
    addTxn({ date: fd.date, dir: 'in', amount: fd.amount, accountId: fd.to, kind: 'transfer', tid, pairAccount: fd.from, note: fd.note, ownerId: fd.ownerId });
    done(); toast('Moved');
  }
};

/* ---------- count cash ---------- */
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
function countTotal(sheet) {
  let t = 0; sheet.querySelectorAll('[data-d]').forEach(i => { t += num(i.value) * num(i.dataset.d); });
  return t + num((sheet.querySelector('[name=loose]') || {}).value);
}
sheets.count = {
  title: 'Count your cash', submit_label: () => 'Fix my balance',
  body: (p) => {
    const accs = S.accounts;
    return `<p class="muted small">Count the notes and coins in hand. We compare with what the app shows and fix the difference${activeScope() !== 'all' ? ` (for ${esc(ownerName(activeScope()))})` : ''}.</p>
    ${field('Which account', sel('accountId', accs.map(a => ({ v: a.id, l: a.name })), p.accountId || S.settings.defaultAccountId, 'data-input="count"'))}
    <div class="denoms">${DENOMS.map(d => `<label><span>₹${d}</span><input type="number" inputmode="numeric" min="0" data-d="${d}" data-input="count" placeholder="0"></label>`).join('')}</div>
    <div style="height:12px"></div>${field('Loose coins / anything else (₹)', inp('loose', { type: 'number', extra: 'data-input="count"' }))}
    <div class="card" id="count-result"></div>`;
  },
  onOpen(el) { inputs.count(el); },
  submit(fd, p, form) {
    const counted = countTotal(form); const diff = round2(counted - accountBalance(V(), fd.accountId));
    if (diff === 0) { toast('Already matches — nothing to fix'); return; }
    addTxn({ date: todayISO(), dir: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), accountId: fd.accountId, kind: 'adjust', note: `Cash count: counted ${money(counted)}` });
    done(); toast(`Balance is now ${money(counted)}`);
  }
};
inputs.count = (el) => {
  const sheet = el.closest ? el.closest('.sheet') : el; if (!sheet) return;
  const id = sheet.querySelector('[name=accountId]').value; const counted = countTotal(sheet); const book = accountBalance(V(), id); const diff = round2(counted - book);
  sheet.querySelector('#count-result').innerHTML = `<div class="kv"><span class="k">You counted</span><span class="v">${money(counted)}</span></div><div class="kv"><span class="k">App shows</span><span class="v">${money(book)}</span></div>
    <div class="kv"><span class="k">Difference</span><span class="v ${diff === 0 ? 'pos' : 'neg'}">${diff === 0 ? 'Matches ✓' : (diff > 0 ? '+' : '') + money(diff)}</span></div>`;
};

/* ---------- edit / delete a transaction ---------- */
sheets.txnEdit = {
  title: 'Edit entry',
  body: (p) => {
    const t = find('txns', p.id); if (!t) return '<p>Not found.</p>';
    return amountField('amount', t.amount) + field('Date', inp('date', { type: 'date', value: t.date, req: true })) +
      (t.kind === 'transfer' ? '' : accountSelect('accountId', t.accountId || '', { allowNone: true })) +
      field('Note', inp('note', { value: t.note || '' })) + ownerField(t.ownerId) +
      `<div class="btn-row" style="margin-bottom:12px"><button type="button" class="btn ghost sm" style="color:var(--neg)" data-act="delTxn" data-id="${t.id}">Delete this entry</button></div>`;
  },
  submit(fd, p) {
    const t = find('txns', p.id); if (!t) return;
    const acc = t.kind === 'transfer' ? null : resolveAcct(fd); if (t.kind !== 'transfer' && needAcct(acc)) return false;
    (t.tid ? S.txns.filter(x => x.tid === t.tid) : [t]).forEach(x => { x.amount = num(fd.amount); x.date = fd.date; x.note = fd.note; x.ownerId = fd.ownerId; if (x === t && t.kind !== 'transfer') x.accountId = acc; });
    done();
  }
};
actions.delTxn = (d) => {
  const t = find('txns', d.id); if (!t) return;
  closeSheet(); withUndo('Entry deleted', () => { S.txns = S.txns.filter(x => t.tid ? x.tid !== t.tid : x.id !== t.id); });
};

/* ---------- accounts, family, people ---------- */
sheets.account = {
  title: (p) => p.id ? 'Edit account' : 'New account',
  body: (p) => { const a = p.id ? find('accounts', p.id) : { name: '', type: 'bank' };
    return field('Name', inp('name', { value: a.name, req: true, ph: 'e.g. SBI savings, Locker, Paytm' })) +
      field('Type', sel('type', [{ v: 'cash', l: 'Cash' }, { v: 'bank', l: 'Bank' }, { v: 'other', l: 'Wallet / other' }], a.type)) +
      (p.id ? (S.accounts.length > 1 ? `<div class="btn-row" style="margin-bottom:12px"><button type="button" class="btn ghost sm" style="color:var(--neg)" data-act="delAccount" data-id="${a.id}">Delete account</button></div>` : '')
        : field('Balance in it right now (₹)', inp('balance', { type: 'number', ph: '0' })) + ownerField()); },
  submit(fd, p) {
    if (p.id) { Object.assign(find('accounts', p.id), { name: fd.name.trim(), type: fd.type }); done(); return; }
    const id = getOrCreateAccount(fd.name, fd.type);
    if (num(fd.balance) > 0) addTxn({ date: todayISO(), dir: 'in', amount: fd.balance, accountId: id, kind: 'opening', note: 'Opening balance', ownerId: fd.ownerId });
    done();
  }
};
actions.delAccount = (d) => {
  if (S.txns.some(t => t.accountId === d.id)) { toast('This account has entries. Delete or move them first.'); return; }
  closeSheet(); withUndo('Account deleted', () => { S.accounts = S.accounts.filter(a => a.id !== d.id); if (S.settings.defaultAccountId === d.id) S.settings.defaultAccountId = S.accounts[0].id; });
};
sheets.owner = {
  title: (p) => p.id ? 'Edit family member' : 'Add family member',
  body: (p) => { const o = p.id ? S.owners.find(x => x.id === p.id) : { name: '' };
    return `<p class="muted small">Every loan, income and cash entry can belong to one person — for example Father or Mother. You can then switch the whole app to see just their money.</p>` +
      field('Name', inp('name', { value: o.name, req: true, ph: 'e.g. Father' })) +
      (p.id && S.owners.length > 1 ? `<div class="btn-row" style="margin-bottom:12px"><button type="button" class="btn ghost sm" style="color:var(--neg)" data-act="delOwner" data-id="${p.id}">Remove</button></div>` : ''); },
  submit(fd, p) {
    const name = fd.name.trim();
    if (S.owners.some(o => o.name.toLowerCase() === name.toLowerCase() && o.id !== p.id)) { toast('That name already exists'); return false; }
    if (p.id) S.owners.find(o => o.id === p.id).name = name; else S.owners.push({ id: uid('o'), name, other: 0 });
    done();
  }
};
actions.delOwner = (d) => {
  const used = [...S.loans, ...S.incomes, ...S.committees, ...S.txns].some(e => e.ownerId === d.id);
  if (used) { toast('This person still has entries. Reassign or delete them first.'); return; }
  closeSheet(); withUndo('Removed', () => { S.owners = S.owners.filter(o => o.id !== d.id); });
};
sheets.person = {
  title: (p) => p.id ? 'Edit person' : 'New person',
  body: (p) => { const x = p.id ? person(S, p.id) : { name: '', phone: '', note: '' };
    return field('Name', inp('name', { value: x.name, req: true })) + field('Phone (for call / WhatsApp)', inp('phone', { type: 'tel', value: x.phone, ph: '98xxxxxxxx' })) + field('Note', inp('note', { value: x.note })); },
  submit(fd, p) {
    const dup = S.people.find(x => x.name.toLowerCase() === fd.name.trim().toLowerCase() && x.id !== p.id);
    if (dup) { toast('Someone with this name already exists'); return false; }
    if (p.id) Object.assign(person(S, p.id), { name: fd.name.trim(), phone: fd.phone.trim(), note: fd.note });
    else S.people.push({ id: uid('p'), name: fd.name.trim(), phone: fd.phone.trim(), note: fd.note });
    done();
  }
};

/* ---------- net worth ---------- */
sheets.networth = {
  title: 'Your net worth', submit_label: () => 'Save',
  body: (p) => {
    const oid = p.ownerId || defaultOwnerId(); const owner = S.owners.find(o => o.id === oid) || S.owners[0];
    const sm = summary(scopedFor(owner.id));
    return (S.owners.length > 1 ? field('For', sel('ownerId', S.owners.map(o => ({ v: o.id, l: o.name })), owner.id, 'data-input="nwOwner"')) : `<input type="hidden" name="ownerId" value="${owner.id}">`) +
      `<div class="card">
        <div class="kv"><span class="k">Cash & accounts</span><span class="v">${money(sm.accounts)}</span></div>
        <div class="kv"><span class="k">Lent to people</span><span class="v">${money(sm.lent)}</span></div>
        ${sm.committee ? `<div class="kv"><span class="k">In committees</span><span class="v">${money(sm.committee)}</span></div>` : ''}
        ${sm.borrowed ? `<div class="kv"><span class="k">Money you owe</span><span class="v">−${money(sm.borrowed)}</span></div>` : ''}
        <div class="kv"><span class="k">Other assets (set by you)</span><span class="v">${money(sm.other)}</span></div>
        <div class="kv"><span class="k"><b>Net worth</b></span><span class="v"><b>${money(sm.worth)}</b></span></div></div>` +
      field('Set my net worth to (₹)', inp('target', { type: 'number', value: sm.worth }), 'The difference is saved as “Other assets” (property, gold, savings not tracked here), so your net worth shows exactly this number.');
  },
  submit(fd) {
    const owner = S.owners.find(o => o.id === fd.ownerId); if (!owner || fd.target === '') return;
    const tracked = summary(scopedFor(owner.id)).tracked;
    owner.other = round2(num(fd.target) - tracked); done(); toast('Net worth updated');
  }
};
inputs.nwOwner = (el) => openSheet('networth', { ownerId: el.value });

/* ---------- loans ---------- */
const rateSync = (el) => {
  const f = el.form.elements; const P = num(f.principal.value), r = f.rate, a = f.amount;
  if (el.name === 'amount') { if (P > 0 && a.value !== '') r.value = round2(num(a.value) / P * 100); }
  else if (el.name === 'rate') { if (P > 0 && r.value !== '') a.value = round2(P * num(r.value) / 100); }
  else if (P > 0) { if (r.value !== '') a.value = round2(P * num(r.value) / 100); else if (a.value !== '') r.value = round2(num(a.value) / P * 100); }
};
inputs.sync = rateSync;
inputs.loanMode = (el) => { const old = el.value === 'old'; el.form.querySelector('#mode-new').classList.toggle('hidden', old); el.form.querySelector('#mode-old').classList.toggle('hidden', !old); };
const pickSchedule = (fd) => ({ amount: num(fd.amount), period: fd.period, customDays: fd.period === 'custom' ? num(fd.customDays) || 30 : '', start: fd.start, timing: fd.timing, group: (fd.group || '').trim(), note: fd.note || '' });
const timingField = (v) => field('When is it paid?', sel('timing', [{ v: 'start', l: 'At the start of each period (advance)' }, { v: 'end', l: 'At the end of each period' }], v || 'start'));
function amountChange(e, newAmount, fromToday) {
  if (num(e.amount) !== num(newAmount) && fromToday) { e.configHistory = e.configHistory || []; e.configHistory.push({ effectiveTo: todayISO(), amount: num(e.amount) }); }
}
function setOwner(e, ownerId) { if (ownerId && e.ownerId !== ownerId) { e.ownerId = ownerId; S.txns.forEach(t => { if (t.refId === e.id) t.ownerId = ownerId; }); } }

sheets.loan = {
  title: (p) => p.id ? 'Edit loan' : 'New loan',
  body: (p) => {
    const l = p.id ? find('loans', p.id) : { dir: p.dir || 'lent', principal: '', rate: '', amount: '', period: 'monthly', start: todayISO(), timing: 'start', dueDate: '', group: '', note: '' };
    const more = periodFields(l) + timingField(l.timing) + field('Loan to be returned by (optional)', inp('dueDate', { type: 'date', value: l.dueDate })) + groupField(l.group) + field('Note (optional)', inp('note', { value: l.note })) + ownerField(l.ownerId) +
      (p.id ? `<label class="check"><input type="checkbox" name="fromToday" checked><span>If the interest amount changed, apply it from today (keep the old amount for past periods). Untick only to correct a mistake.</span></label>` : '');
    return (p.id ? '' : field('This loan is', sel('dir', [{ v: 'lent', l: 'Money I gave (lent)' }, { v: 'borrowed', l: 'Money I took (borrowed)' }], l.dir))) +
      personInput('person', p.id ? personName(S, l.personId) : '', { label: 'Person' }) +
      amountField('principal', l.principal, 'Loan amount (₹)').replace('<input ', '<input data-input="sync" ') +
      `<div class="two">${field('Interest % per period', inp('rate', { type: 'number', value: l.rate, extra: 'data-input="sync"' }))}${field('Interest ₹ per period', inp('amount', { type: 'number', value: l.amount, extra: 'data-input="sync"' }))}</div>
      <div class="fhint" style="margin:-8px 0 14px">Fill either one — the other fills itself. Leave empty for no interest.</div>` +
      (p.id ? '' : `${field('Is this a new or an old loan?', sel('mode', [{ v: 'new', l: 'New — money is moving now' }, { v: 'old', l: 'Old — given earlier, before I used this app' }], 'new', 'data-input="loanMode"'))}
        <div id="mode-new">${accountSelect('accountId', S.settings.defaultAccountId, { allowNone: false, label: 'Money moves in/out of' })}</div>
        <div id="mode-old" class="hidden"><div class="banner">Your cash balance will <b>not</b> change.</div>
          <label class="check"><input type="checkbox" name="counted"><span>This money is <b>already counted in my net worth</b> — don't increase it again.</span></label></div>`) +
      field(p.id ? 'Starting date' : 'Date given', inp('start', { type: 'date', value: l.start, req: true })) + moreOptions(more);
  },
  submit(fd, p) {
    if (num(fd.principal) <= 0) { toast('Enter the loan amount'); return false; }
    const sch = pickSchedule(fd); const personId = getOrCreatePerson(fd.person); const rate = fd.rate === '' ? '' : num(fd.rate);
    if (p.id) {
      const l = find('loans', p.id); amountChange(l, sch.amount, !!fd.fromToday);
      Object.assign(l, sch, { personId, principal: num(fd.principal), rate, dueDate: fd.dueDate || '' }); setOwner(l, fd.ownerId);
      done(); return;
    }
    const isOld = fd.mode === 'old'; let acc = null;
    if (!isOld) { acc = resolveAcct(fd); if (needAcct(acc)) return false; }
    const l = Object.assign({ id: uid('l'), dir: fd.dir, ownerId: fd.ownerId, personId, principal: num(fd.principal), rate, dueDate: fd.dueDate || '', manualDue: 0, configHistory: [], frozen: false, frozenDate: null }, sch);
    S.loans.push(l);
    if (!isOld && acc) addTxn({ date: fd.start, dir: l.dir === 'lent' ? 'out' : 'in', amount: l.principal, accountId: acc, kind: l.dir === 'lent' ? 'lend' : 'borrow', personId, refId: l.id, note: 'Loan' });
    if (isOld && fd.counted) { const w = S.owners.find(o => o.id === l.ownerId); l.nwOffset = l.dir === 'lent' ? -l.principal : l.principal; w.other = round2(num(w.other) + l.nwOffset); }
    done(); go('loans/' + l.id);
  }
};

sheets.lendMore = {
  title: (p) => find('loans', p.id).dir === 'borrowed' ? 'Borrow more' : 'Lend more',
  body: (p) => { const f = loanFigures(S, find('loans', p.id));
    return amountField() + field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) + accountSelect('accountId', S.settings.defaultAccountId, { label: 'Money moves in/out of' }) +
      (f.rate > 0 ? `<label class="check"><input type="checkbox" name="recalc" checked><span>Recalculate interest at ${f.rate}% on the new total</span></label>` : ''); },
  submit(fd, p) {
    const l = find('loans', p.id); const amt = num(fd.amount); if (amt <= 0) return false;
    const acc = resolveAcct(fd); if (needAcct(acc)) return false;
    const rate = loanFigures(S, l).rate; l.principal = num(l.principal) + amt;
    if (fd.recalc) { const out = loanFigures(S, l).outstanding; amountChange(l, round2(out * rate / 100), true); l.amount = round2(out * rate / 100); l.rate = rate; }
    addTxn({ date: fd.date, dir: l.dir === 'lent' ? 'out' : 'in', amount: amt, accountId: acc, kind: l.dir === 'lent' ? 'lend' : 'borrow', personId: l.personId, refId: l.id, note: 'Additional amount' });
    done();
  }
};

sheets.principal = {
  title: (p) => find('loans', p.id).dir === 'borrowed' ? 'Repay loan amount' : 'Loan amount returned',
  body: (p) => { const f = loanFigures(S, find('loans', p.id));
    return `<p class="muted small">Still outstanding: <b>${money(f.outstanding)}</b></p>` + amountField('amount', f.outstanding).replace('<input ', '<input data-input="prin" ') +
      field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) + accountSelect('accountId', S.settings.defaultAccountId, { label: 'Money moves in/out of' }) + `<div id="prin-opt"></div>`; },
  onOpen(el) { inputs.prin(el.querySelector('[name=amount]')); },
  submit(fd, p) {
    const l = find('loans', p.id); const f = loanFigures(S, l); const amt = num(fd.amount); if (amt <= 0) return false;
    const acc = resolveAcct(fd); if (needAcct(acc)) return false;
    const remaining = round2(f.outstanding - amt);
    addTxn({ date: fd.date, dir: l.dir === 'lent' ? 'in' : 'out', amount: amt, accountId: acc, kind: l.dir === 'lent' ? 'lend_back' : 'borrow_back', personId: l.personId, refId: l.id, note: 'Loan amount returned' });
    if (remaining <= 0 && fd.stop) { l.frozen = true; l.frozenDate = fd.date; }
    else if (remaining > 0 && fd.recalc) { const na = round2(remaining * f.rate / 100); amountChange(l, na, true); l.amount = na; l.rate = f.rate; }
    done();
  }
};
inputs.prin = (el) => {
  const l = find('loans', ui.sheet.params.id); const fig = loanFigures(S, l); const remaining = round2(fig.outstanding - num(el.value));
  const box = el.form.querySelector('#prin-opt'); if (!box) return;
  if (remaining <= 0) box.innerHTML = `<label class="check"><input type="checkbox" name="stop" checked><span>Fully returned — stop adding interest from this date</span></label>`;
  else if (fig.rate > 0) box.innerHTML = `<label class="check"><input type="checkbox" name="recalc" checked><span>Recalculate interest at ${fig.rate}% on the remaining ${money(remaining)} → ${money(remaining * fig.rate / 100)} per period</span></label>`;
  else box.innerHTML = '';
};

/* ---------- regular income ---------- */
sheets.income = {
  title: (p) => p.id ? 'Edit income source' : 'New regular income',
  body: (p) => {
    const i = p.id ? find('incomes', p.id) : { title: '', amount: '', period: 'monthly', start: todayISO(), timing: 'start', group: '', note: '' };
    return personInput('person', p.id ? personName(S, i.personId) : '', { label: 'Who pays you', ph: 'e.g. Aarav (student), Tenant' }) +
      amountField('amount', i.amount, 'Amount each time (₹)') + periodFields(i) + field('Starting date', inp('start', { type: 'date', value: i.start, req: true })) +
      moreOptions(field('What for (optional)', inp('title', { value: i.title, ph: 'e.g. Maths tuition, Shop rent' })) + timingField(i.timing) + groupField(i.group) + field('Note (optional)', inp('note', { value: i.note })) + ownerField(i.ownerId) +
        (p.id ? `<label class="check"><input type="checkbox" name="fromToday" checked><span>If the amount changed, apply it from today (keep the old amount for past periods).</span></label>` : ''));
  },
  submit(fd, p) {
    const sch = pickSchedule(fd); const personId = getOrCreatePerson(fd.person);
    if (p.id) { const i = find('incomes', p.id); amountChange(i, sch.amount, !!fd.fromToday); Object.assign(i, sch, { personId, title: fd.title.trim() }); setOwner(i, fd.ownerId); done(); return; }
    const i = Object.assign({ id: uid('i'), ownerId: fd.ownerId, personId, title: fd.title.trim(), manualDue: 0, configHistory: [], frozen: false, frozenDate: null }, sch);
    S.incomes.push(i); done(); go('income/' + i.id);
  }
};

/* ---------- receive / pay a period ---------- */
const amountOf = (e, d) => { for (const s of e.configHistory || []) if (d < s.effectiveTo) return num(s.amount); return num(e.amount); };
function periodOptions(e) {
  const f = scheduleFigures(S, e); const rows = f.rows.map(r => ({ date: r.date, left: Math.max(0, round2(r.due - r.paid)) }));
  if (!e.frozen) { const nx = dueDates(e, cutoff(e), 1); const d = nx[nx.length - 1]; if (d > cutoff(e)) rows.push({ date: d, left: amountOf(e, d) }); }
  return rows;
}
sheets.receive = {
  title: (p) => p.kind === 'loan' && find('loans', p.id).dir === 'borrowed' ? 'Pay interest' : (p.kind === 'loan' ? 'Interest received' : 'Payment received'),
  body: (p) => {
    const e = find(p.kind === 'loan' ? 'loans' : 'incomes', p.id); const opts = periodOptions(e);
    const first = opts.find(o => o.left > 0) || opts[opts.length - 1] || { date: '', left: num(e.amount) };
    const pend = scheduleFigures(S, e).pending;
    return `<p class="muted small">${esc(personName(S, e.personId))}${pend > 0 ? ` · pending <b>${money(pend)}</b>` : ''}</p>` + amountField('amount', first.left) +
      field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) +
      accountSelect('accountId', S.settings.defaultAccountId, { label: p.kind === 'loan' && e.dir === 'borrowed' ? 'Paid from' : 'Received into' }) +
      moreOptions(field('Which period is this for?', `<select name="forPeriod" data-input="periodAmt">${opts.map(o => `<option value="${o.date}" data-left="${o.left}" ${o.date === first.date ? 'selected' : ''}>${fmtDate(o.date)} — ${o.left <= 0 ? 'paid' : money(o.left) + ' due'}</option>`).join('')}<option value="" data-left="${pend}">Not for a specific period</option></select>`) + field('Note (optional)', inp('note')));
  },
  submit(fd, p) {
    const e = find(p.kind === 'loan' ? 'loans' : 'incomes', p.id); if (num(fd.amount) <= 0) return false;
    const acc = resolveAcct(fd); if (needAcct(acc)) return false;
    const out = p.kind === 'loan' && e.dir === 'borrowed';
    addTxn({ date: fd.date, dir: out ? 'out' : 'in', amount: fd.amount, accountId: acc, kind: p.kind === 'loan' ? 'interest' : 'income', personId: e.personId, refId: e.id, forPeriod: fd.forPeriod || null, note: fd.note });
    done(); toast(out ? 'Payment recorded' : 'Received ✓');
  }
};
inputs.periodAmt = (el) => { el.form.elements.amount.value = el.selectedOptions[0].dataset.left; };
sheets.pending = {
  title: 'Add old pending amount',
  body: () => `<p class="muted small">For money that was already due before you started using this app.</p>` + amountField(),
  submit(fd, p) { const e = find(p.kind === 'loan' ? 'loans' : 'incomes', p.id); e.manualDue = num(e.manualDue) + num(fd.amount); done(); }
};

/* ---------- ⋯ menu on a loan / income / committee ---------- */
sheets.entityMenu = {
  title: 'More', raw: true,
  body: (p) => {
    const kind = p.kind; const e = find({ loan: 'loans', income: 'incomes', committee: 'committees' }[kind], p.id); if (!e) return '';
    const it = (ic, label, attrs, tone = 'neutral') => `<div class="item" ${attrs}><div class="bubble ${tone}">${icon(ic)}</div><div class="main-col"><div class="t">${label}</div></div></div>`;
    const items = [it('user', 'Edit details', `data-act="sheet" data-sheet="${kind}" data-id="${e.id}"`)];
    if (kind === 'loan') items.push(it('plus', e.dir === 'borrowed' ? 'Borrow more' : 'Lend more', `data-act="sheet" data-sheet="lendMore" data-id="${e.id}"`));
    if (kind !== 'committee') {
      items.push(it('plus', 'Add old pending amount', `data-act="sheet" data-sheet="pending" data-kind="${kind}" data-id="${e.id}"`));
      items.push(it('calendar', e.frozen ? 'Unfreeze (start adding periods again)' : 'Freeze (stop adding new periods)', `data-act="menuDo" data-do="freeze" data-kind="${kind}" data-id="${e.id}"`));
      const p = person(S, e.personId); const f = scheduleFigures(S, e);
      if (p && p.phone && f.pending > 0 && !(kind === 'loan' && e.dir === 'borrowed')) items.push(`<a class="item" target="_blank" rel="noopener" href="${waLink(p.phone, `Hi ${p.name}, a gentle reminder — ${money(f.pending)} is pending. Please send it when you can. Thank you!`)}"><div class="bubble in">${icon('down')}</div><div class="main-col"><div class="t">Send WhatsApp reminder</div></div></a>`);
    }
    items.push(it('minus', 'Remove', `data-act="menuDo" data-do="delEntity" data-kind="${kind}" data-id="${e.id}"`, 'out'));
    return `<div class="list menu">${items.join('')}</div>`;
  }
};
actions.menuDo = (d) => { closeSheet(); actions[d.do](d); };
actions.freeze = (d) => {
  const e = find(d.kind === 'loan' ? 'loans' : 'incomes', d.id);
  if (e.frozen) { e.frozen = false; e.frozenDate = null; done(); return; }
  confirmDlg({ title: 'Freeze this?', body: 'No new periods will be added from today. Anything already due stays payable. You can unfreeze later.', ok: 'Yes, freeze', danger: false, run: () => { e.frozen = true; e.frozenDate = todayISO(); done(); } });
};
actions.delEntity = (d) => {
  const list = { loan: 'loans', income: 'incomes', committee: 'committees' }[d.kind];
  const n = S.txns.filter(t => t.refId === d.id).length;
  confirmDlg({ title: 'Remove this?', body: n ? `This also removes its ${n} payment entries from your cash book, so account balances will change. You can undo right after.` : 'You can undo right after.', ok: 'Yes, remove',
    run: () => { go(d.kind === 'committee' ? 'committees' : d.kind === 'loan' ? 'loans' : 'income'); withUndo('Removed', () => {
      const e = find(list, d.id); if (e && e.nwOffset) { const w = S.owners.find(o => o.id === e.ownerId); if (w) w.other = round2(num(w.other) - e.nwOffset); }
      S[list] = S[list].filter(x => x.id !== d.id); S.txns = S.txns.filter(t => t.refId !== d.id); }); } });
};
actions.delPerson = (d) => {
  const used = S.loans.some(l => l.personId === d.id) || S.incomes.some(i => i.personId === d.id) || S.committees.some(c => c.organizer === d.id || (c.members || []).some(m => m.personId === d.id));
  if (used) { toast('Remove their loans, income and committee entries first'); return; }
  confirmDlg({ title: 'Delete this person?', body: 'Their name is removed from past cash entries (the entries stay).', ok: 'Delete', run: () => { go('people'); withUndo('Person deleted', () => { S.txns.forEach(t => { if (t.personId === d.id) t.personId = null; }); S.people = S.people.filter(p => p.id !== d.id); }); } });
};

/* ---------- committees ---------- */
const memberRow = (m = {}) => `<div class="mrow"><input name="mName" value="${esc(personName(S, m.personId))}" placeholder="Member name" list="people-dl"><input name="mSlots" type="number" min="1" value="${m.slots || 1}" inputmode="numeric" title="Slots"><button type="button" data-act="rmMember" aria-label="Remove">×</button></div>`;
actions.addMember = (d, el) => { el.closest('form').querySelector('.members-rows').insertAdjacentHTML('beforeend', memberRow()); };
actions.rmMember = (d, el) => el.closest('.mrow').remove();

sheets.committee = {
  title: (p) => p.id ? 'Edit committee' : 'New committee',
  body: (p) => {
    const c = p.id ? find('committees', p.id) : { name: '', role: 'member', type: 'lottery', perSlot: '', slots: '', mySlots: 1, period: 'monthly', start: todayISO(), commission: '', members: [{}, {}], organizer: '', note: '' };
    const org = c.role === 'organizer'; const vis = (r) => (r === (org ? 'organizer' : 'member') ? '' : 'hidden');
    return field('Committee name', inp('name', { value: c.name, req: true, ph: 'e.g. Sharma ji kameti' })) +
      field('Your role', sel('role', [{ v: 'member', l: 'I am a member (I pay & get the pot)' }, { v: 'organizer', l: 'I run it (I collect & pay out)' }], c.role, 'data-input="role"')) +
      amountField('perSlot', c.perSlot, 'Installment each time (₹)') +
      `<div data-role="member" class="${vis('member')}">${field('Total members (= number of rounds)', inp('slots', { type: 'number', value: c.slots, min: 1 }))}</div>
       <div data-role="organizer" class="${vis('organizer')}"><span class="flabel">Members and their slots</span><div class="members-rows">${(c.members && c.members.length ? c.members : [{}, {}]).map(memberRow).join('')}</div>
         <button type="button" class="link" data-act="addMember">+ Add member</button><datalist id="people-dl">${S.people.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></div>` +
      field('First installment date', inp('start', { type: 'date', value: c.start, req: true })) +
      moreOptions(periodFields(c) + field('How is the winner chosen?', sel('type', [{ v: 'lottery', l: 'Lucky draw / fixed turns' }, { v: 'bidding', l: 'Bidding (chit fund — discount)' }], c.type)) +
        `<div data-role="member" class="${vis('member')}">${field('How many slots are yours', inp('mySlots', { type: 'number', value: c.mySlots || 1, min: 1 }))}${personInput('organizer', c.organizer ? personName(S, c.organizer) : '', { req: false, label: 'Who runs it (optional)' })}</div>
         <div data-role="organizer" class="${vis('organizer')}">${field('Your commission per round (₹)', inp('commission', { type: 'number', value: c.commission }), 'Kept by you out of each pot.')}</div>` +
        field('Note (optional)', inp('note', { value: c.note || '' })) + ownerField(c.ownerId));
  },
  submit(fd, p, form) {
    const org = fd.role === 'organizer'; const data = new FormData(form);
    const names = data.getAll('mName'), slots = data.getAll('mSlots');
    const members = org ? names.map((n, i) => ({ personId: getOrCreatePerson(n), slots: Math.max(1, num(slots[i]) || 1) })).filter(m => m.personId) : [];
    if (org && !members.length) { toast('Add at least one member'); return false; }
    if (!org && num(fd.slots) < 1) { toast('Enter the number of members'); return false; }
    const v = { name: fd.name.trim(), role: fd.role, type: fd.type, perSlot: num(fd.perSlot), period: fd.period, customDays: fd.period === 'custom' ? num(fd.customDays) || 30 : '', start: fd.start, note: fd.note || '',
      slots: org ? members.reduce((s, m) => s + m.slots, 0) : num(fd.slots), mySlots: org ? 0 : Math.max(1, num(fd.mySlots) || 1), members, commission: org ? num(fd.commission) : 0, organizer: !org && fd.organizer ? getOrCreatePerson(fd.organizer) : '' };
    if (p.id) { const c = find('committees', p.id); Object.assign(c, v); setOwner(c, fd.ownerId); }
    else { const c = Object.assign({ id: uid('c'), rounds: {}, ownerId: fd.ownerId }, v); S.committees.push(c); done(); go('committees/' + c.id); return; }
    done();
  }
};

const chitAcc = () => ui.chitAcc || S.settings.defaultAccountId;
inputs.chitAcc = (el) => { ui.chitAcc = el.value; };
sheets.round = {
  live: true, raw: true,
  title: (p) => `${find('committees', p.id).name} · Round ${p.no}`,
  body: (p) => {
    const c = find('committees', p.id); const f = chitFigures(S, c); const r = f.rounds[p.no - 1]; const org = c.role === 'organizer';
    const accSel = field('Money goes through', sel('acc', S.accounts.map(a => ({ v: a.id, l: a.name })), chitAcc(), 'data-input="chitAcc"'));
    const winnerTxt = r.winner === 'me' ? 'You' : org ? (r.winner ? personName(S, r.winner) : '') : (r.winnerName || (r.winner === 'other' ? 'Someone else' : ''));
    const head = `<div class="card"><div class="kv"><span class="k">Date</span><span class="v">${fmtDate(r.date)}</span></div>
      <div class="kv"><span class="k">Pot</span><span class="v">${money(r.pot)}</span></div>
      <div class="kv"><span class="k">Winner</span><span class="v">${winnerTxt ? esc(winnerTxt) : '<span class="muted">not decided</span>'}</span></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn ghost sm" data-act="sheet" data-sheet="roundEdit" data-id="${c.id}" data-no="${r.no}">Set winner / edit round</button></div></div>${accSel}`;
    let mid = '';
    if (!org) {
      const left = Math.max(0, round2(r.due - r.paid));
      mid = `<div class="card"><div class="kv"><span class="k">Your installment</span><span class="v">${money(r.due)}</span></div><div class="kv"><span class="k">Paid</span><span class="v pos">${money(r.paid)}</span></div>
        <div class="btn-row" style="margin-top:8px">${left > 0 ? `<button class="btn green" data-act="chitQuick" data-kind="chit_pay" data-id="${c.id}" data-no="${r.no}" data-amt="${left}">Pay ${money(left)} now</button>` : '<span class="pill green">Paid ✓</span>'}
        <button class="btn ghost sm" data-act="sheet" data-sheet="chitMoney" data-kind="chit_pay" data-id="${c.id}" data-no="${r.no}">Other amount</button></div></div>`;
      if (r.winner === 'me') mid += `<div class="card"><div class="kv"><span class="k">Pot for you</span><span class="v">${money(r.payout)}</span></div><div class="kv"><span class="k">Received</span><span class="v pos">${money(r.received)}</span></div>
        <div class="btn-row" style="margin-top:8px">${r.received < r.payout ? `<button class="btn green" data-act="chitQuick" data-kind="chit_win" data-id="${c.id}" data-no="${r.no}" data-amt="${round2(r.payout - r.received)}">Received ${money(r.payout - r.received)}</button>` : '<span class="pill green">Received ✓</span>'}
        <button class="btn ghost sm" data-act="sheet" data-sheet="chitMoney" data-kind="chit_win" data-id="${c.id}" data-no="${r.no}">Other amount</button></div></div>`;
    } else {
      mid = `<div class="list">${r.members.map(m => `<div class="item" style="cursor:default"><div class="main-col"><div class="t">${esc(personName(S, m.personId))}${m.slots > 1 ? ` ×${m.slots}` : ''}</div><div class="s">due ${money(m.due)} · paid ${money(m.paid)}</div></div>
        ${m.left > 0 ? `<button class="btn green sm" data-act="chitQuick" data-kind="chit_collect" data-id="${c.id}" data-no="${r.no}" data-person="${m.personId}" data-amt="${m.left}">Collect ${money(m.left)}</button>` : '<span class="pill green">Paid ✓</span>'}</div>`).join('')}</div>
        <div class="card" style="margin-top:14px"><div class="kv"><span class="k">Collected</span><span class="v">${money(r.paid)} of ${money(r.due)}</span></div>
        <div class="kv"><span class="k">Pot to pay out</span><span class="v">${money(r.payout)}</span></div>
        <div class="btn-row" style="margin-top:8px">${r.settled ? `<span class="pill green">Paid out ${money(r.paidOut)} ✓</span>` : (r.winner ? `<button class="btn gold" data-act="chitQuick" data-kind="chit_payout" data-id="${c.id}" data-no="${r.no}" data-person="${r.winner}" data-amt="${r.payout}">Pay ${money(r.payout)} to ${esc(personName(S, r.winner))}</button>` : '<span class="muted small">Set the winner to pay out.</span>')}</div></div>`;
    }
    return head + mid + `<div class="sheet-actions"><button class="btn ghost" data-act="closeSheet">Close</button></div>`;
  }
};
actions.round = (d) => openSheet('round', { id: d.id, no: Number(d.no) });
actions.chitQuick = (d) => {
  const c = find('committees', d.id); const dir = d.kind === 'chit_pay' || d.kind === 'chit_payout' ? 'out' : 'in';
  addTxn({ date: todayISO(), dir, amount: d.amt, accountId: chitAcc(), kind: d.kind, personId: d.person || c.organizer || null, refId: c.id, round: Number(d.no) });
  commit(save); toast('Recorded');
};
sheets.chitMoney = {
  title: (p) => ({ chit_pay: 'Pay installment', chit_win: 'Pot received', chit_collect: 'Collect installment', chit_payout: 'Pay out pot' })[p.kind],
  body: (p) => { const c = find('committees', p.id); const r = chitFigures(S, c).rounds[p.no - 1];
    const def = p.kind === 'chit_pay' ? r.due - r.paid : p.kind === 'chit_win' ? r.payout - r.received : r.payout;
    return `<p class="muted small">Round ${p.no} · ${fmtDate(r.date)}</p>` + amountField('amount', Math.max(0, def)) + field('Date', inp('date', { type: 'date', value: todayISO(), req: true })) + accountSelect('accountId', chitAcc()); },
  submit(fd, p) {
    const c = find('committees', p.id); const dir = p.kind === 'chit_pay' || p.kind === 'chit_payout' ? 'out' : 'in';
    if (num(fd.amount) <= 0) return false;
    const acc = resolveAcct(fd); if (needAcct(acc)) return false;
    addTxn({ date: fd.date, dir, amount: fd.amount, accountId: acc, kind: p.kind, personId: p.person || c.organizer || null, refId: c.id, round: Number(p.no) });
    done(); openSheet('round', { id: p.id, no: Number(p.no) }); return false;
  }
};
sheets.roundEdit = {
  title: (p) => `Round ${p.no} details`,
  body: (p) => {
    const c = find('committees', p.id); const r = chitRound(c, Number(p.no)); const org = c.role === 'organizer'; const bid = c.type === 'bidding';
    const winnerSel = org ? sel('winner', [{ v: '', l: 'Not decided yet' }, ...c.members.map(m => ({ v: m.personId, l: personName(S, m.personId) }))], r.winner)
      : sel('winner', [{ v: '', l: 'Not decided yet' }, { v: 'me', l: 'Me' }, { v: 'other', l: 'Someone else' }], r.winner, 'data-input="winnerSel"');
    return field('Who won this round', winnerSel) +
      (org ? '' : `<div id="wname" class="${r.winner === 'other' ? '' : 'hidden'}">${field('Winner name (optional)', inp('winnerName', { value: r.winnerName }))}</div>`) +
      (bid ? field('Bid discount (₹)', inp('discount', { type: 'number', value: r.discount || '', extra: 'data-input="bid"' }), 'Fills the two amounts below. Edit them if your committee works differently.') : '') +
      field('Installment per slot this round (₹)', inp('installment', { type: 'number', value: r.installment, req: true })) +
      field('Amount the winner receives (₹)', inp('payout', { type: 'number', value: r.payout, req: true }), `Full pot is ${money(r.pot)}.`);
  },
  submit(fd, p) {
    const c = find('committees', p.id); c.rounds = c.rounds || {};
    c.rounds[p.no] = { winner: fd.winner, winnerName: fd.winner === 'other' ? (fd.winnerName || '').trim() : '', installment: num(fd.installment), payout: num(fd.payout), discount: num(fd.discount) };
    done(); openSheet('round', { id: p.id, no: Number(p.no) }); return false;
  }
};
inputs.winnerSel = (el) => { el.form.querySelector('#wname').classList.toggle('hidden', el.value !== 'other'); };
inputs.bid = (el) => {
  const c = find('committees', ui.sheet.params.id); const d = num(el.value); const slots = chitSlots(c) || 1; const pot = num(c.perSlot) * slots;
  el.form.elements.payout.value = round2(Math.max(0, pot - d - num(c.commission))); el.form.elements.installment.value = round2(num(c.perSlot) - d / slots);
};
actions.payFor = (d) => {
  if (d.type === 'loanPay') openSheet('receive', { kind: 'loan', id: d.id });
  else if (d.type === 'incPay') openSheet('receive', { kind: 'income', id: d.id });
};

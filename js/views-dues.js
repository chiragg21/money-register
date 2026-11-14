// Loans and regular income share the same "recurring dues" machinery.
import { views, actions, ui } from './core.js';
import { S, V, usedGroups } from './store.js';
import { esc, money, fmtDate, num } from './util.js';
import { loanFigures, scheduleFigures, periodText, rateUnit, personName } from './engine.js';
import { icon, addBtn, moreBtn, section, kv, stat, empty, pill, txnList, fold, ownerTag, multiOwner } from './kit.js';

const SORTS = { pending: 'Most pending first', amount: 'Biggest amount', name: 'Name A–Z', oldest: 'Oldest first' };
function controls(key, groups, showStatus) {
  const q = ui.q; const open = q[key + 'Filters']; const nf = (q[key + 'Group'] ? 1 : 0) + ((q[key + 'Sort'] || 'pending') !== 'pending' ? 1 : 0) + (q[key + 'Status'] === showStatus ? 1 : 0);
  return `<div class="toolbar"><input id="${key}-search" data-input="qtext" data-key="${key}Text" placeholder="Search by name" value="${esc(q[key + 'Text'] || '')}"><button class="btn ghost sm" data-act="toggleQ" data-k="${key}Filters">Filter${nf ? ` (${nf})` : ''}</button></div>
  ${open ? `<div class="toolbar"><select data-input="qsel" data-key="${key}Sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${(q[key + 'Sort'] || 'pending') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${groups.length ? `<select data-input="qsel" data-key="${key}Group"><option value="">All groups</option>${groups.map(g => `<option ${q[key + 'Group'] === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
    <select data-input="qsel" data-key="${key}Status"><option value="active">Active only</option><option value="${showStatus}" ${q[key + 'Status'] === showStatus ? 'selected' : ''}>${showStatus === 'settled' ? 'Settled only' : 'Frozen only'}</option></select></div>` : ''}`;
}
const sortRows = (rows, key, pendingOf, amountOf, nameOf, startOf) => {
  const s = ui.q[key + 'Sort'] || 'pending';
  return rows.sort((a, b) => s === 'amount' ? amountOf(b) - amountOf(a) : s === 'name' ? nameOf(a).localeCompare(nameOf(b)) : s === 'oldest' ? startOf(a).localeCompare(startOf(b)) : pendingOf(b) - pendingOf(a) || nameOf(a).localeCompare(nameOf(b)));
};
const filterRows = (rows, key, nameOf, groupOf) => { const t = (ui.q[key + 'Text'] || '').trim().toLowerCase(), g = ui.q[key + 'Group'] || ''; return rows.filter(r => (!t || nameOf(r).toLowerCase().includes(t)) && (!g || groupOf(r) === g)); };
const statusPill = (f, e) => e.frozen ? pill('Frozen', 'blue') : f.pending > 0 ? pill(f.overdueDays > 0 ? `${f.overdueDays}d overdue` : 'Due', 'red') : (f.settled ? pill('Settled', 'green') : pill('All clear', 'green'));

/* ================= LOANS ================= */
views.loans = (r) => {
  if (r.id) return dueDetail('loan', r.id);
  const D = V(); const dir = ui.q.loanDir || 'lent'; const settledView = ui.q.loanStatus === 'settled';
  const all = D.loans.filter(l => l.dir === dir).map(l => ({ l, f: loanFigures(D, l) }));
  let rows = filterRows(all, 'loan', x => personName(S, x.l.personId), x => x.l.group).filter(x => settledView ? x.f.settled : !x.f.settled);
  rows = sortRows(rows, 'loan', x => x.f.pending + x.f.outstanding * 1e-9, x => x.f.outstanding, x => personName(S, x.l.personId), x => x.l.start);
  const act = all.filter(x => !x.f.settled);
  const out = act.reduce((s, x) => s + x.f.outstanding, 0), pend = act.reduce((s, x) => s + x.f.pending, 0), mon = act.reduce((s, x) => s + x.f.monthly, 0);
  return {
    title: 'Loans', right: addBtn('loan', `data-dir="${dir}"`),
    html: `<div class="seg"><button class="${dir === 'lent' ? 'on' : ''}" data-act="setQ" data-k="loanDir" data-v="lent">Given by me</button><button class="${dir === 'borrowed' ? 'on' : ''}" data-act="setQ" data-k="loanDir" data-v="borrowed">Taken by me</button></div>
    <div class="card"><div class="small muted">${dir === 'lent' ? 'Lent out' : 'You owe'}</div><div style="font-size:28px;font-weight:700">${money(out)}</div>
      <div class="small muted" style="margin-top:4px">${pend > 0 ? `<span class="${dir === 'lent' ? 'pos' : 'neg'}">${money(pend)} interest pending</span> · ` : ''}about ${money(mon)} interest every month</div></div>
    ${controls('loan', usedGroups(), 'settled')}
    ${rows.length ? `<div class="list">${rows.map(({ l, f }) => `<a class="item" href="#/loans/${l.id}"><div class="main-col"><div class="t">${esc(personName(S, l.personId))}${ownerTag(l.ownerId)}</div>
      <div class="s">${money(f.outstanding)}${num(l.amount) ? ` · ${money(l.amount)} ${periodText(l)}` : ' · no interest'}${l.group ? ' · ' + esc(l.group) : ''}</div></div>
      <div class="r">${f.pending > 0 ? `<div class="${dir === 'lent' ? 'pos' : 'neg'}">${money(f.pending)}</div>` : ''}${statusPill(f, l)}</div></a>`).join('')}</div>`
      : `<div class="list">${empty(all.length ? 'Nothing matches this view.' : dir === 'lent' ? 'No loans given yet. Tap + to add one.' : 'No borrowed money recorded.')}</div>`}`
  };
};

/* ================= INCOME ================= */
views.income = (r) => {
  if (r.id) return dueDetail('income', r.id);
  const D = V(); const frozenView = ui.q.incStatus === 'frozen';
  const all = D.incomes.map(i => ({ i, f: scheduleFigures(D, i) }));
  let rows = filterRows(all, 'inc', x => personName(S, x.i.personId) + ' ' + (x.i.title || ''), x => x.i.group).filter(x => frozenView ? x.i.frozen : !x.i.frozen);
  rows = sortRows(rows, 'inc', x => x.f.pending, x => num(x.i.amount), x => personName(S, x.i.personId), x => x.i.start);
  const act = all.filter(x => !x.i.frozen);
  const mon = act.reduce((s, x) => s + x.f.monthly, 0), pend = act.reduce((s, x) => s + x.f.pending, 0);
  return {
    title: 'Regular income', right: addBtn('income'),
    html: `<div class="card"><div class="small muted">Expected every month</div><div style="font-size:28px;font-weight:700">${money(mon)}</div>
      <div class="small muted" style="margin-top:4px">${pend > 0 ? `<span class="neg">${money(pend)} pending</span> · ` : ''}${act.length} active</div></div>
    ${controls('inc', usedGroups(), 'frozen')}
    ${rows.length ? `<div class="list">${rows.map(({ i, f }) => `<a class="item" href="#/income/${i.id}"><div class="main-col"><div class="t">${esc(personName(S, i.personId))}${ownerTag(i.ownerId)}</div>
      <div class="s">${money(i.amount)} ${periodText(i)}${i.title ? ' · ' + esc(i.title) : ''}${i.group ? ' · ' + esc(i.group) : ''}</div></div>
      <div class="r">${f.pending > 0 ? `<div class="neg">${money(f.pending)}</div>` : ''}${statusPill(f, i)}</div></a>`).join('')}</div>`
      : `<div class="list">${empty(all.length ? 'Nothing matches this view.' : 'Add tuition fees, rent or any monthly income and see who has paid.')}</div>`}`
  };
};

/* ================= SHARED DETAIL ================= */
function dueDetail(kind, id) {
  const D = V(); const isLoan = kind === 'loan';
  const e = (isLoan ? S.loans : S.incomes).find(x => x.id === id);
  const back = isLoan ? '#/loans' : '#/income', backLabel = isLoan ? 'Loans' : 'Regular income';
  if (!e) return { title: 'Not found', back, backLabel, html: empty('This entry no longer exists.') };
  const f = isLoan ? loanFigures(S, e) : scheduleFigures(S, e);
  const name = personName(S, e.personId); const borrowed = isLoan && e.dir === 'borrowed';
  const a = `data-kind="${kind}" data-id="${id}"`;
  const txns = S.txns.filter(t => t.refId === id);
  const hist = f.rows.slice().reverse().map(r => {
    const st = r.paid <= 0 ? ['Not paid', 'red'] : r.paid < r.due ? ['Partial', 'gold'] : ['Paid', 'green'];
    return `<tr><td>${fmtDate(r.date)}</td><td class="r">${money(r.due)}</td><td class="r">${money(r.paid)}</td><td class="r"><span class="pill ${st[1]}">${st[0]}</span></td></tr>`;
  }).join('');
  const interestLine = num(e.amount) ? `${money(e.amount)} ${periodText(e)}${isLoan && f.rate ? ` (${f.rate}% per ${rateUnit(e)})` : ''}` : 'no interest';
  const pendTxt = f.pending > 0 ? (f.overdueDays > 0 ? `${f.overdueDays} days overdue` : f.oldBalance ? 'old balance' : 'due now') : 'all clear';
  return {
    title: name, back, backLabel, right: moreBtn(kind, id),
    html: `${e.frozen ? `<div class="banner">Frozen on ${fmtDate(e.frozenDate)} — no new periods are being added.</div>` : ''}
    ${isLoan && f.settled ? `<div class="banner ok">This loan is fully settled ✓</div>` : ''}
    <div class="card">
      ${isLoan ? `<div class="small muted">${borrowed ? 'You still owe' : 'Still to come back'}${ownerTag(e.ownerId)}</div><div style="font-size:32px;font-weight:700">${money(f.outstanding)}</div><div class="small muted">of ${money(e.principal)} · ${interestLine}</div>`
        : `<div class="small muted">Pending${ownerTag(e.ownerId)}</div><div style="font-size:32px;font-weight:700" class="${f.pending > 0 ? 'neg' : 'pos'}">${money(f.pending)}</div><div class="small muted">${money(e.amount)} ${periodText(e)}${e.title ? ' · ' + esc(e.title) : ''}</div>`}
      <div class="kv" style="margin-top:12px"><span class="k">${isLoan ? (borrowed ? 'Interest you owe' : 'Interest pending') : 'Status'}</span><span class="v ${f.pending > 0 ? (borrowed ? 'neg' : 'pos') : ''}">${isLoan ? money(f.pending) + ' · ' : ''}${pendTxt}</span></div>
      <div class="kv"><span class="k">Next due</span><span class="v">${f.next ? fmtDate(f.next) : '—'}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="sheet" data-sheet="receive" ${a}>${borrowed ? 'Pay interest' : isLoan ? 'Interest received' : 'Payment received'}</button>
      ${isLoan ? `<button class="btn soft" data-act="sheet" data-sheet="principal" data-id="${id}">${borrowed ? 'Repay loan amount' : 'Loan amount returned'}</button>` : ''}
    </div>
    ${section('Payments')}${txnList(txns, { group: true, emptyText: 'No payments recorded yet.' })}
    <div style="height:14px"></div>
    ${f.rows.length ? fold(`${kind}-hist-${id}`, 'Period-wise history', `<div class="scroll-x"><table class="tbl"><thead><tr><th>Period</th><th class="r">Due</th><th class="r">Received</th><th class="r">Status</th></tr></thead><tbody>${hist}</tbody></table></div>`) : ''}
    ${fold(`${kind}-terms-${id}`, 'Details', `${kv('Person', `<a href="#/people/${e.personId}" style="text-decoration:underline">${esc(name)}</a>`)}
      ${isLoan ? kv(borrowed ? 'Borrowed' : 'Lent', money(e.principal)) + kv('Interest', interestLine) : kv('Fee', interestLine)}
      ${kv('Started', fmtDate(e.start) + ' · ' + (e.timing === 'end' ? 'paid at end of period' : 'paid in advance'))}
      ${isLoan && e.dueDate ? kv('Return by', fmtDate(e.dueDate)) : ''}${e.group ? kv('Group', esc(e.group)) : ''}${e.note ? kv('Note', esc(e.note)) : ''}
      ${num(e.manualDue) ? kv('Old pending included', money(e.manualDue)) : ''}
      ${(e.configHistory || []).length ? kv('Earlier amounts', e.configHistory.map(h => `${money(h.amount)} until ${fmtDate(h.effectiveTo)}`).join('<br>')) : ''}`)}`
  };
}

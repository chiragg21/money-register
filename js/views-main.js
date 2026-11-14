import { views, actions, inputs, ui, render } from './core.js';
import { S, V, activeScope, ownerName } from './store.js';
import { esc, money, fmtDate, todayISO, monthKey, monthLabel, shiftMonth, round2, daysBetween } from './util.js';
import { summary, attention, holdings, monthStats, accountBalance, loanFigures, scheduleFigures, chitFigures, txnClass, KINDS, personName } from './engine.js';
import { icon, addBtn, section, kv, stat, empty, pill, txnList, waLink, ownerTag, multiOwner } from './kit.js';

actions.setQ = (d) => { ui.q[d.k] = d.v; render(); };
actions.toggleQ = (d) => { ui.q[d.k] = !ui.q[d.k]; render(); };
inputs.qtext = (el) => { ui.q[el.dataset.key] = el.value; render(); };
inputs.qsel = (el) => { ui.q[el.dataset.key] = el.value; render(); };
const scopeChip = () => (multiOwner() ? `<button class="scopechip" data-act="drawer">${activeScope() === 'all' ? 'Everyone' : esc(ownerName(activeScope()))}</button>` : '');

/* ================= HOME ================= */
views.home = () => {
  const D = V(); const sm = summary(D); const att = attention(D); const hold = holdings(D);
  const hasData = S.txns.length + S.loans.length + S.incomes.length + S.committees.length > 0;
  const backupAge = S.settings.lastBackup ? daysBetween(S.settings.lastBackup.slice(0, 10), todayISO()) : null;
  const nudge = hasData && (backupAge === null || backupAge > 14)
    ? `<div class="banner warn">${backupAge === null ? 'You haven’t saved a backup yet.' : `Last backup was ${backupAge} days ago.`} Your data is stored only in this browser. <a href="#/settings">Back up now</a></div>` : '';
  const lent = hold.filter(h => h.type === 'lent'), lentTotal = lent.reduce((s, h) => s + h.amount, 0);
  const cashTotal = sm.accounts, comm = Math.max(0, sm.committee);
  const total = (Math.max(0, cashTotal) + lentTotal + comm) || 1;
  const bar = [[Math.max(0, cashTotal), 'var(--primary)'], [lentTotal, 'var(--amber)'], [comm, 'var(--blue)']];
  const showAll = ui.q.allDue; const shown = showAll ? att : att.slice(0, 4);
  const accChips = D.accounts.length > 1 ? `<div class="chips">${D.accounts.map(a => `<span class="chip">${esc(a.name)} ${money(accountBalance(D, a.id))}</span>`).join('')}</div>` : '';
  return {
    title: 'Money Register', right: scopeChip(),
    html: `${nudge}
    <div class="hero"><div class="lbl">Cash in hand</div><div class="big">${money(sm.accounts)}</div>${accChips}
      <button class="nw" data-act="sheet" data-sheet="networth"><span>Net worth</span><b>${money(sm.worth)} ›</b></button></div>
    <div class="tiles">
      <button class="tile" data-act="sheet" data-sheet="money" data-dir="in">${icon('down')}<span>Money in</span></button>
      <button class="tile" data-act="sheet" data-sheet="money" data-dir="out">${icon('up')}<span>Money out</span></button>
      <button class="tile" data-act="sheet" data-sheet="loan">${icon('loan')}<span>New loan</span></button>
      <button class="tile" data-act="sheet" data-sheet="more">${icon('more')}<span>More</span></button></div>
    ${section('Coming up', att.length ? `<span class="muted small">${att.length} item${att.length > 1 ? 's' : ''}</span>` : '')}
    ${att.length ? `<div class="list">${shown.map(attRow).join('')}</div>${att.length > 4 ? `<button class="link" data-act="toggleQ" data-k="allDue">${showAll ? 'Show less' : `Show all ${att.length}`}</button>` : ''}`
      : `<div class="list">${empty(hasData ? 'Nothing is due right now 🎉' : 'Add a loan, regular income or committee and what’s due will show up here.')}</div>`}
    ${hold.length ? `${section('Where your money is')}
    <div class="card"><div class="stack">${bar.map(([v, c]) => `<i style="width:${v / total * 100}%;background:${c}"></i>`).join('')}</div>
      <a class="hold" href="#/cash"><b style="background:var(--primary)"></b><span>In hand / accounts</span><span>${money(cashTotal)}</span></a>
      ${lentTotal > 0 ? `<button class="hold" data-act="toggleQ" data-k="openLent"><b style="background:var(--amber)"></b><span>Lent to people ${ui.q.openLent ? '▴' : '▾'}</span><span>${money(lentTotal)}</span></button>` : ''}
      ${ui.q.openLent ? `<div class="bars" style="padding:0 0 4px 22px">${lent.map(h => `<a class="b" href="${h.href}"><div class="bt"><span>${esc(h.label)}</span><span>${money(h.amount)} · ${Math.round(h.amount / lentTotal * 100)}%</span></div><div class="track"><div class="fill lent" style="width:${h.amount / lentTotal * 100}%"></div></div></a>`).join('')}</div>` : ''}
      ${comm > 0 ? `<a class="hold" href="#/committees"><b style="background:var(--blue)"></b><span>In committees</span><span>${money(comm)}</span></a>` : ''}
      ${sm.borrowed > 0 ? `<a class="hold" href="#/loans" data-x><b style="background:var(--neg)"></b><span>You owe (borrowed)</span><span class="neg">−${money(sm.borrowed)}</span></a>` : ''}</div>` : ''}`
  };
};
function attRow(a) {
  const when = a.upcoming ? '' : a.days > 0 ? `${a.days} days overdue` : 'due today';
  const btn = a.act ? `<div style="margin-top:6px" onclick="event.stopPropagation()"><button class="btn ${a.side === 'receive' ? 'green' : 'red'} sm" data-act="payFor" data-type="${a.act.type}" data-id="${a.act.id}">${a.side === 'receive' ? 'Receive' : 'Pay'}</button></div>` : '';
  return `<div class="item" onclick="location.hash='${a.href}'">
    <div class="bubble ${a.side === 'receive' ? 'in' : 'out'}">${icon(a.side === 'receive' ? 'down' : 'up')}</div>
    <div class="main-col"><div class="t">${esc(a.title)}${ownerTag(a.owner)}</div><div class="s">${esc(a.sub)}${when ? ' · ' + when : ''}</div></div>
    <div class="r"><div class="${a.side === 'receive' ? 'pos' : 'neg'}">${money(a.amount)}</div>${btn}</div></div>`;
}

/* ================= CASH ================= */
views.cash = () => {
  const D = V(); const q = ui.q; q.cashMonth = q.cashMonth || monthKey(todayISO()); q.cashAcc = q.cashAcc || 'all'; q.cashDir = q.cashDir || 'all'; q.cashText = q.cashText || '';
  const m = q.cashMonth; const ms = m === 'all' ? null : monthStats(D, m);
  let list = D.txns.filter(t => (m === 'all' || monthKey(t.date) === m) && (q.cashAcc === 'all' || t.accountId === q.cashAcc || (q.cashAcc === 'none' && !t.accountId)));
  if (q.cashDir !== 'all') list = list.filter(t => t.dir === q.cashDir);
  if (q.cashText.trim()) { const k = q.cashText.trim().toLowerCase(); list = list.filter(t => (personName(S, t.personId) + ' ' + (t.note || '') + ' ' + (KINDS[t.kind] || {}).label).toLowerCase().includes(k)); }
  const sm = summary(D);
  const nf = (q.cashAcc !== 'all' ? 1 : 0) + (q.cashDir !== 'all' ? 1 : 0);
  return {
    title: 'Cash & accounts', right: addBtn('account'),
    html: `<div class="hero"><div class="lbl">Total in all accounts</div><div class="big">${money(sm.accounts)}</div>
      <div class="btn-row"><button class="btn ghost sm" data-act="sheet" data-sheet="money" data-dir="in">+ Money in</button><button class="btn ghost sm" data-act="sheet" data-sheet="money" data-dir="out">− Money out</button></div></div>
    <div class="list">${S.accounts.map(a => `<div class="item" data-act="sheet" data-sheet="account" data-id="${a.id}"><div class="bubble neutral">${icon('wallet')}</div><div class="main-col"><div class="t">${esc(a.name)}</div></div><div class="r">${money(accountBalance(D, a.id))}</div></div>`).join('')}</div>
    <div class="btn-row" style="margin-top:10px"><button class="btn soft sm" data-act="sheet" data-sheet="count">${icon('calc')} Count cash</button><button class="btn soft sm" data-act="sheet" data-sheet="transfer">${icon('swap')} Move money</button></div>
    ${section('History')}
    <div class="monthnav"><button class="btn ghost sm" data-act="cashMonth" data-d="-1" ${m === 'all' ? 'disabled' : ''}>‹</button><b>${m === 'all' ? 'All time' : monthLabel(m)}</b>
      <span class="btn-row" style="flex:none"><button class="btn ghost sm" data-act="cashMonth" data-d="1" ${m === 'all' ? 'disabled' : ''}>›</button><button class="btn ghost sm" data-act="cashMonth" data-d="all">${m === 'all' ? 'By month' : 'All time'}</button></span></div>
    ${ms ? `<div class="stats"><div class="stat"><div class="lbl">Money in</div><div class="val pos">${money(ms.in)}</div></div><div class="stat"><div class="lbl">Money out</div><div class="val">${money(ms.out)}</div></div></div>` : ''}
    <div class="toolbar"><input id="cash-search" data-input="qtext" data-key="cashText" placeholder="Search" value="${esc(q.cashText)}"><button class="btn ghost sm" data-act="toggleQ" data-k="cashFilters">Filter${nf ? ` (${nf})` : ''}</button></div>
    ${q.cashFilters ? `<div class="toolbar"><select data-input="qsel" data-key="cashAcc"><option value="all">All accounts</option>${S.accounts.map(a => `<option value="${a.id}" ${q.cashAcc === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="none" ${q.cashAcc === 'none' ? 'selected' : ''}>Not in any account</option></select>
      <select data-input="qsel" data-key="cashDir"><option value="all">In &amp; out</option><option value="in" ${q.cashDir === 'in' ? 'selected' : ''}>Only in</option><option value="out" ${q.cashDir === 'out' ? 'selected' : ''}>Only out</option></select></div>` : ''}
    ${txnList(list, { group: true, emptyText: 'Nothing here yet.' })}`
  };
};
actions.cashMonth = (d) => { const q = ui.q; q.cashMonth = d.d === 'all' ? (q.cashMonth === 'all' ? monthKey(todayISO()) : 'all') : shiftMonth(q.cashMonth, Number(d.d)); render(); };

/* ================= PEOPLE ================= */
export function personBalance(D, pid) {
  let owesMe = 0, iOwe = 0;
  D.loans.filter(l => l.personId === pid).forEach(l => { const f = loanFigures(D, l); if (l.dir === 'borrowed') iOwe += f.outstanding + f.pending; else owesMe += f.outstanding + f.pending; });
  D.incomes.filter(i => i.personId === pid).forEach(i => { owesMe += scheduleFigures(D, i).pending; });
  D.committees.forEach(c => { if (c.role === 'organizer') { const f = chitFigures(D, c); f.rounds.forEach(r => r.members.filter(x => x.personId === pid).forEach(x => { if (r.date <= todayISO()) owesMe += x.left; })); } });
  return { owesMe: round2(owesMe), iOwe: round2(iOwe) };
}
const involved = (D, pid) => D.loans.some(l => l.personId === pid) || D.incomes.some(i => i.personId === pid) || D.txns.some(t => t.personId === pid) || D.committees.some(c => c.organizer === pid || (c.members || []).some(m => m.personId === pid));
views.people = (r) => {
  if (r.id) return personDetail(r.id);
  const D = V(); const k = (ui.q.people || '').trim().toLowerCase();
  const rows = S.people.filter(p => activeScope() === 'all' || involved(D, p.id)).map(p => ({ p, b: personBalance(D, p.id) })).filter(x => !k || x.p.name.toLowerCase().includes(k))
    .sort((a, b) => (b.b.owesMe + b.b.iOwe) - (a.b.owesMe + a.b.iOwe) || a.p.name.localeCompare(b.p.name));
  const totOwes = rows.reduce((s, x) => s + x.b.owesMe, 0);
  return {
    title: 'People', right: addBtn('person') + scopeChip(),
    html: `<div class="card"><div class="small muted">Total owed to you</div><div style="font-size:26px;font-weight:700" class="pos">${money(totOwes)}</div><div class="small muted">loan amounts + pending interest + pending fees</div></div>
      <div class="toolbar"><input id="people-search" data-input="qtext" data-key="people" placeholder="Search people" value="${esc(ui.q.people || '')}"></div>
      ${rows.length ? `<div class="list">${rows.map(({ p, b }) => `<a class="item" href="#/people/${p.id}"><div class="bubble neutral">${icon('user')}</div><div class="main-col"><div class="t">${esc(p.name)}</div><div class="s">${p.phone ? esc(p.phone) : 'no phone saved'}</div></div>
        <div class="r">${b.owesMe > 0 ? `<div class="pos">${money(b.owesMe)}</div><div class="s">owes you</div>` : b.iOwe > 0 ? `<div class="neg">${money(b.iOwe)}</div><div class="s">you owe</div>` : '<span class="muted">—</span>'}</div></a>`).join('')}</div>` : `<div class="list">${empty('No people yet. They are added automatically with a loan, income or committee.')}</div>`}`
  };
};
function personDetail(id) {
  const D = V(); const p = S.people.find(x => x.id === id); if (!p) return { title: 'People', back: '#/people', html: empty('Person not found.') };
  const b = personBalance(D, id); const loans = D.loans.filter(l => l.personId === id); const incs = D.incomes.filter(i => i.personId === id);
  const coms = D.committees.filter(c => c.organizer === id || (c.members || []).some(m => m.personId === id));
  const txns = D.txns.filter(t => t.personId === id);
  const wa = p.phone && b.owesMe > 0 ? waLink(p.phone, `Hi ${p.name}, a gentle reminder — ${money(b.owesMe)} is pending with me. Please send it when you can. Thank you!`) : '';
  return {
    title: p.name, back: '#/people', backLabel: 'People', right: `<button class="iconbtn" data-act="sheet" data-sheet="person" data-id="${id}" aria-label="Edit">${icon('more')}</button>`,
    html: `<div class="card">${b.owesMe > 0 ? `<div class="small muted">Owes you</div><div style="font-size:28px;font-weight:700" class="pos">${money(b.owesMe)}</div>` : b.iOwe > 0 ? `<div class="small muted">You owe</div><div style="font-size:28px;font-weight:700" class="neg">${money(b.iOwe)}</div>` : '<div class="muted">Nothing pending with this person.</div>'}
      <div class="btn-row" style="margin-top:12px">${p.phone ? `<a class="btn ghost sm" href="tel:${esc(p.phone)}">Call</a>` : ''}${wa ? `<a class="btn sm" target="_blank" rel="noopener" href="${wa}">WhatsApp reminder</a>` : ''}</div></div>
      ${loans.length ? section('Loans') + `<div class="list">${loans.map(l => { const f = loanFigures(D, l); return `<a class="item" href="#/loans/${l.id}"><div class="main-col"><div class="t">${l.dir === 'borrowed' ? 'Borrowed' : 'Lent'} ${money(l.principal)}${ownerTag(l.ownerId)}</div><div class="s">outstanding ${money(f.outstanding)}${f.pending ? ' · interest pending ' + money(f.pending) : ''}</div></div>${f.settled ? pill('Settled', 'green') : ''}</a>`; }).join('')}</div>` : ''}
      ${incs.length ? section('Regular income') + `<div class="list">${incs.map(i => { const f = scheduleFigures(D, i); return `<a class="item" href="#/income/${i.id}"><div class="main-col"><div class="t">${money(i.amount)} ${esc(i.title || '')}${ownerTag(i.ownerId)}</div><div class="s">received ${money(f.received)}</div></div>${f.pending > 0 ? pill(money(f.pending) + ' due', 'red') : pill('Clear', 'green')}</a>`; }).join('')}</div>` : ''}
      ${coms.length ? section('Committees') + `<div class="list">${coms.map(c => `<a class="item" href="#/committees/${c.id}"><div class="main-col"><div class="t">${esc(c.name)}</div></div></a>`).join('')}</div>` : ''}
      ${txns.length ? section('Cash entries') + txnList(txns, { group: true }) : ''}
      <div style="margin-top:20px"><button class="link danger" data-act="delPerson" data-id="${id}">Delete this person</button></div>`
  };
}

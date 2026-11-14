import { views, actions, inputs, ui, render, toast, confirmDlg, openSheet, closeSheet, sheets, commit } from './core.js';
import { S, V, save, setState, snapshot, restore, importLegacyEntries, storageOk, hashPin, blank, activeScope, ownerName } from './store.js';
import { esc, money, fmtDate, num, round2, todayISO, uid } from './util.js';
import { chitFigures, periodText, personName, KINDS, accountBalance, refLabel } from './engine.js';
import { icon, addBtn, moreBtn, section, kv, stat, empty, pill, txnList, field, inp, sel, accountName, fold, ownerTag } from './kit.js';

/* ================= COMMITTEES ================= */
views.committees = (r) => {
  if (r.id) return committeeDetail(r.id);
  const D = V(); const rows = D.committees.map(c => ({ c, f: chitFigures(D, c) }));
  const payNow = rows.reduce((s, x) => s + x.f.payNow, 0), recNow = rows.reduce((s, x) => s + x.f.collectNow, 0);
  return {
    title: 'Committees', right: addBtn('committee'),
    html: `${rows.length && (payNow || recNow) ? `<div class="stats">${stat('To pay now', money(payNow), '', payNow > 0 ? 'neg' : '')}${stat('To receive now', money(recNow), '', recNow > 0 ? 'pos' : '')}</div>` : ''}
    ${rows.length ? `<div class="list">${rows.map(({ c, f }) => { const org = c.role === 'organizer'; const n = f.next;
      return `<a class="item" href="#/committees/${c.id}"><div class="bubble gold">${icon('cycle')}</div><div class="main-col"><div class="t">${esc(c.name)}${ownerTag(c.ownerId)}</div>
        <div class="s">${org ? 'You run it' : 'Member'} · ${money(c.perSlot)} ${periodText(c)}${f.finished ? '' : n ? ` · next ${fmtDate(n.date)}` : ''}</div></div>
        <div class="r">${f.finished ? pill('Finished', 'green') : f.payNow > 0 ? `<div class="neg">${money(f.payNow)}</div><div class="s">to pay</div>` : f.collectNow > 0 ? `<div class="pos">${money(f.collectNow)}</div><div class="s">to receive</div>` : pill('On track', 'plain')}</div></a>`; }).join('')}</div>`
      : `<div class="list">${empty('Join or run a committee (kameti / BC / chit) and track every round, installment and pot here.')}</div>`}`
  };
};
function committeeDetail(id) {
  const c = S.committees.find(x => x.id === id); const back = '#/committees', backLabel = 'Committees';
  if (!c) return { title: 'Not found', back, backLabel, html: empty('This committee no longer exists.') };
  const f = chitFigures(S, c); const org = c.role === 'organizer';
  const txns = S.txns.filter(t => t.refId === id);
  const main = org
    ? `<div class="small muted">Holding for members${ownerTag(c.ownerId)}</div><div style="font-size:30px;font-weight:700">${money(f.held)}</div><div class="small muted">collected ${money(f.collected)} · paid out ${money(f.paidOut)} · your commission ${money(f.commission)}</div>`
    : `<div class="small muted">Paid in so far${ownerTag(c.ownerId)}</div><div style="font-size:30px;font-weight:700">${money(f.paidTotal)}</div><div class="small muted">still to pay ${money(f.remaining)}${f.payNow > 0 ? ` (<span class="neg">${money(f.payNow)} due now</span>)` : ''} · ${f.won.length ? `you won round ${f.won.map(r => r.no).join(', ')} (${money(f.receivedTotal)} received)` : 'you haven’t won yet'}</div>`;
  return {
    title: c.name, back, backLabel, right: moreBtn('committee', id),
    html: `${f.finished ? '<div class="banner ok">This committee is complete ✓</div>' : ''}
    ${!org && f.collectNow > 0 ? `<div class="banner warn">You won a round — ${money(f.collectNow)} of the pot is still to be received.</div>` : ''}
    <div class="card">${main}</div>
    ${section('Rounds', `<span class="muted small">${f.n} rounds · ${c.type === 'bidding' ? 'bidding' : 'lucky draw'}</span>`)}
    <div class="list">${f.rounds.map(r => {
      const win = r.winner === 'me' ? 'You won' : org ? (r.winner ? personName(S, r.winner) + ' won' : '') : (r.winner === 'other' ? (r.winnerName || 'Someone else') + ' won' : '');
      const st = org ? (r.settled ? pill('Paid out', 'green') : r.pending > 0 ? pill(money(r.pending) + ' to collect', 'red') : r.paid >= r.due && r.due > 0 ? pill('Collected', 'green') : pill(r.date > todayISO() ? 'Upcoming' : '—', 'plain'))
        : (r.pending > 0 ? pill(money(r.pending) + ' due', 'red') : r.paid >= r.due && r.due > 0 ? pill('Paid', 'green') : pill('Upcoming', 'plain'));
      return `<div class="item" data-act="round" data-id="${id}" data-no="${r.no}"><div class="bubble ${r.winner === 'me' ? 'gold' : 'neutral'}" style="font-size:14px;font-weight:650">${r.no}</div>
        <div class="main-col"><div class="t">${fmtDate(r.date)}</div><div class="s">${esc(win || 'winner not set')} · ${org ? 'pot ' + money(r.payout) : 'you pay ' + money(r.due)}</div></div>
        <div class="r">${st}${!org && r.potPending > 0 ? `<div style="margin-top:4px">${pill(money(r.potPending) + ' to receive', 'gold')}</div>` : ''}${org && r.potPending > 0 ? `<div style="margin-top:4px">${pill('pay out ' + money(r.potPending), 'gold')}</div>` : ''}</div></div>`;
    }).join('')}</div>
    <div class="small muted" style="margin:8px 2px 14px">Tap a round to ${org ? 'collect from members, pay the pot' : 'pay your installment, record the pot'} and set the winner.</div>
    ${fold('chit-entries-' + id, `Payments (${txns.length})`, txnList(txns, { group: true, emptyText: 'No payments recorded yet.' }))}`
  };
}

/* ================= SETTINGS ================= */
const THEME_KEY = 'mr-theme';
export function applyTheme() {
  let t = 'auto'; try { t = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
views.settings = () => {
  let theme = 'auto'; try { theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { }
  const size = Math.round(snapshot().length / 1024);
  return {
    title: 'Settings',
    html: `${storageOk ? '' : '<div class="banner bad">This browser is blocking storage — your changes will NOT be saved. Turn off private mode or allow site data.</div>'}
    ${section('Family members', `<button class="link" data-act="sheet" data-sheet="owner">+ Add</button>`)}
    <div class="list">${S.owners.map(o => `<div class="item" data-act="sheet" data-sheet="owner" data-id="${o.id}"><div class="bubble neutral">${icon('user')}</div><div class="main-col"><div class="t">${esc(o.name)}</div></div></div>`).join('')}</div>
    <div class="small muted" style="margin:6px 2px">Add Father, Mother… then give each loan, income or cash entry to one person and switch the app between them from the menu.</div>
    ${section('Accounts', `<button class="link" data-act="sheet" data-sheet="account">+ Add</button>`)}
    <div class="list">${S.accounts.map(a => `<div class="item" data-act="sheet" data-sheet="account" data-id="${a.id}"><div class="main-col"><div class="t">${esc(a.name)}</div></div><div class="r">${money(accountBalance(S, a.id))}</div></div>`).join('')}</div>
    ${S.accounts.length > 1 ? `<div class="toolbar" style="margin-top:10px"><select data-input="defAcc">${S.accounts.map(a => `<option value="${a.id}" ${S.settings.defaultAccountId === a.id ? 'selected' : ''}>Default: ${esc(a.name)}</option>`).join('')}</select></div>` : ''}
    ${section('Backup')}
    <div class="card"><div class="small muted" style="margin-bottom:12px">Your data lives only in this browser. Clearing site data or switching phones erases it, so save a backup file now and then. Last backup: <b>${S.settings.lastBackup ? fmtDate(S.settings.lastBackup.slice(0, 10)) : 'never'}</b>.</div>
      <div class="btn-row"><button class="btn" data-act="exportJson">Save backup</button><button class="btn ghost" data-act="pickImport">Load backup…</button></div>
      <input type="file" id="import-file" class="hidden" accept="application/json,.json" data-input="importFile">
      <div style="margin-top:8px"><button class="link" data-act="exportCsv">Export cash book (CSV)</button></div>
      <div class="fhint">A backup from the old Money Register can be loaded here too.</div></div>
    ${section('Look & security')}
    <div class="card">${field('Theme', sel('theme', [{ v: 'auto', l: 'Match my phone' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }], theme, 'data-input="theme"'))}
      <div class="kv"><span class="k">App lock (PIN)</span><span class="v">${S.settings.pinHash ? 'On' : 'Off'}</span></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn ghost sm" data-act="sheet" data-sheet="pin">${S.settings.pinHash ? 'Change PIN' : 'Set a PIN'}</button>${S.settings.pinHash ? `<button class="btn ghost sm" data-act="lock">Lock now</button><button class="btn ghost sm" data-act="removePin">Remove PIN</button>` : ''}</div>
      <div class="fhint">The PIN only hides the screen; the saved data is not encrypted.</div></div>
    ${fold('settings-data', 'About my data', `${kv('Cash entries', String(S.txns.length))}${kv('People', String(S.people.length))}${kv('Loans / income / committees', `${S.loans.length} / ${S.incomes.length} / ${S.committees.length}`)}${kv('Storage used', size + ' KB')}
      <div style="margin-top:10px"><button class="link danger" data-act="eraseAll">Erase everything</button></div>`)}`
  };
};
inputs.theme = (el) => { try { localStorage.setItem(THEME_KEY, el.value); } catch (e) { } applyTheme(); };
inputs.defAcc = (el) => { S.settings.defaultAccountId = el.value; save(); render(); };

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
actions.exportJson = () => { download(`money-register-backup-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'); S.settings.lastBackup = new Date().toISOString(); save(); render(); toast('Backup saved to your downloads'); };
actions.exportCsv = () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Account', 'Type', 'Person', 'For', 'Round', 'In', 'Out', 'Note'].join(',')];
  [...S.txns].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([t.date, accountName(t.accountId) || '(not in any account)', (KINDS[t.kind] || {}).label || t.kind, personName(S, t.personId), refLabel(S, t.refId), t.round || '', t.dir === 'in' ? t.amount : '', t.dir === 'out' ? t.amount : '', t.note || ''].map(q).join(',')));
  download(`cash-book-${todayISO()}.csv`, '﻿' + rows.join('\n'), 'text/csv');
};
actions.pickImport = () => document.getElementById('import-file').click();
inputs.importFile = (el) => {
  const file = el.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    el.value = '';
    let data; try { data = JSON.parse(rd.result); } catch (e) { toast('That file could not be read'); return; }
    if (Array.isArray(data)) {
      const snap = snapshot(); const n = importLegacyEntries(data, file.name.replace(/\.json$/i, '').replace(/[-_]?backup.*$/i, '') || 'Imported');
      save(); render(); toast(`Added ${n} entries from old backup`, () => { restore(snap); render(); });
    } else if (data && data.v >= 2 && Array.isArray(data.txns)) {
      confirmDlg({ title: 'Replace all data?', body: `This replaces everything in the app with the backup (${data.txns.length} entries, ${(data.loans || []).length} loans). You can undo right after.`, ok: 'Yes, replace', run: () => { const snap = snapshot(); setState(data); render(); toast('Backup loaded', () => { restore(snap); render(); }); } });
    } else toast('This does not look like a Money Register backup');
  };
  rd.readAsText(file);
};
actions.eraseAll = () => confirmDlg({ title: 'Erase everything?', body: 'All accounts, loans, income, committees and entries are deleted from this browser. Save a backup first if unsure. You can undo right after.', ok: 'Yes, erase', run: () => { const snap = snapshot(); setState(Object.assign(blank(), {})); render(); toast('Everything erased', () => { restore(snap); render(); }); } });

/* ----- PIN ----- */
sheets.pin = {
  title: 'Set a PIN', submit_label: () => 'Save PIN',
  body: () => field('New PIN (4–8 digits)', inp('pin', { type: 'password', req: true, extra: 'inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="new-password"' })) + field('Repeat PIN', inp('pin2', { type: 'password', req: true, extra: 'inputmode="numeric" maxlength="8" autocomplete="new-password"' })),
  submit(fd) {
    if (fd.pin !== fd.pin2) { toast('The two PINs differ'); return false; }
    const salt = uid('s'); hashPin(fd.pin, salt).then(h => { S.settings.pinSalt = salt; S.settings.pinHash = h; save(); render(); toast('PIN set'); });
  }
};
actions.removePin = () => confirmDlg({ title: 'Remove PIN?', body: 'The app will open without asking for a PIN.', ok: 'Remove', run: () => { S.settings.pinHash = null; save(); render(); } });

// Pure calculation logic: schedules, dues, balances, committees. No DOM here.
import { num, round2, todayISO, addDays, addMonths, daysBetween, monthKey } from './util.js';

/* ---------- periods ---------- */
export const PERIODS = {
  weekly: { label: 'Every week', days: 7, unit: 'week' },
  fortnightly: { label: 'Every 2 weeks', days: 14, unit: '2 weeks' },
  monthly: { label: 'Every month', months: 1, unit: 'month' },
  quarterly: { label: 'Every 3 months', months: 3, unit: '3 months' },
  yearly: { label: 'Every year', months: 12, unit: 'year' },
  custom: { label: 'Custom number of days', unit: 'period' }
};
const per = (s) => PERIODS[s.period] || PERIODS.monthly;
export function periodDays(s) { const p = per(s); return p.days || (p.months ? p.months * 365 / 12 : (num(s.customDays) || 30)); }
export function periodText(s) { return s.period === 'custom' ? `every ${num(s.customDays) || 30} days` : per(s).label.toLowerCase(); }
export function rateUnit(s) { return s.period === 'custom' ? `${num(s.customDays) || 30} days` : per(s).unit; }
export function nthDate(s, k) {
  const p = per(s);
  if (p.months) return addMonths(s.start, k * p.months);
  return addDays(s.start, k * (p.days || num(s.customDays) || 30));
}

/* ---------- transaction kinds ---------- */
// cls: earn / spend (counted in profit), capital (lending, committees), other, transfer, adjust
export const KINDS = {
  income: { label: 'Income received', cls: 'earn' },
  interest: { label: 'Interest', cls: 'earn' },
  expense: { label: 'Expense', cls: 'spend' },
  lend: { label: 'Loan given', cls: 'capital' },
  lend_back: { label: 'Loan returned', cls: 'capital' },
  borrow: { label: 'Money borrowed', cls: 'capital' },
  borrow_back: { label: 'Borrowed money repaid', cls: 'capital' },
  chit_pay: { label: 'Committee installment paid', cls: 'capital' },
  chit_win: { label: 'Committee pot received', cls: 'capital' },
  chit_collect: { label: 'Installment collected', cls: 'capital' },
  chit_payout: { label: 'Pot paid to winner', cls: 'capital' },
  in_other: { label: 'Money added', cls: 'other' },
  out_other: { label: 'Money taken out', cls: 'other' },
  transfer: { label: 'Transfer', cls: 'transfer' },
  adjust: { label: 'Cash count adjustment', cls: 'adjust' },
  opening: { label: 'Opening balance', cls: 'adjust' }
};
export function txnClass(t) {
  if (t.kind === 'interest') return t.dir === 'in' ? 'earn' : 'spend';
  return (KINDS[t.kind] || { cls: 'other' }).cls;
}

/* ---------- accounts ---------- */
export function accountBalance(S, id) {
  let b = 0;
  for (const t of S.txns) if (t.accountId === id) b += t.dir === 'in' ? num(t.amount) : -num(t.amount);
  return round2(b);
}

/* ---------- recurring schedules (loan interest & regular income share this) ---------- */
export const cutoff = (e, today = todayISO()) => (e.frozen && e.frozenDate ? e.frozenDate : today);
export function dueDates(s, upto, extra = 0) {
  const out = []; let k = s.timing === 'end' ? 1 : 0;
  for (let g = 0; g < 3000; g++) { const d = nthDate(s, k); if (d > upto) break; out.push(d); k++; }
  for (let i = 0; i < extra; i++) out.push(nthDate(s, k++));
  return out;
}
export function amountFor(s, iso) {
  for (const seg of s.configHistory || []) if (iso < seg.effectiveTo) return num(seg.amount);
  return num(s.amount);
}
export const monthlyEquiv = (s) => num(s.amount) * (365 / 12) / periodDays(s);

export function scheduleFigures(S, e, today = todayISO()) {
  const dates = dueDates(e, cutoff(e, today));
  const rows = dates.map(date => ({ date, due: amountFor(e, date), paid: 0 }));
  const pays = S.txns.filter(t => t.refId === e.id && (t.kind === 'interest' || t.kind === 'income'));
  let received = 0;
  for (const p of pays) {
    received += num(p.amount);
    const r = p.forPeriod && rows.find(x => x.date === p.forPeriod);
    if (r) r.paid += num(p.amount);
  }
  const manual = num(e.manualDue);
  const expected = rows.reduce((s, r) => s + r.due, 0) + manual;
  const pending = Math.max(0, round2(expected - received));
  // oldest unpaid period (money is applied oldest-first)
  let rem = received, oldest = null, oldBalance = false;
  if (rem < manual) oldBalance = true; else rem -= manual;
  if (!oldBalance) for (const r of rows) { if (rem >= r.due - 0.005) rem -= r.due; else { oldest = r.date; break; } }
  const overdueDays = pending > 0 ? (oldest ? Math.max(0, daysBetween(oldest, today)) : 0) : 0;
  let next = null;
  if (!e.frozen) { const d = dueDates(e, today, 1); const last = d[d.length - 1]; if (last > today) next = last; }
  return {
    rows, expected, received, pending, oldest, oldBalance, overdueDays, next,
    monthly: e.frozen ? 0 : monthlyEquiv(e)
  };
}

export function loanFigures(S, l, today = todayISO()) {
  const f = scheduleFigures(S, l, today);
  const back = l.dir === 'borrowed' ? 'borrow_back' : 'lend_back';
  const repaid = S.txns.filter(t => t.refId === l.id && t.kind === back).reduce((s, t) => s + num(t.amount), 0);
  const outstanding = Math.max(0, round2(num(l.principal) - repaid));
  const settled = outstanding === 0 && f.pending === 0;
  const rate = l.rate !== '' && l.rate != null ? num(l.rate) : (num(l.principal) ? round2(num(l.amount) / num(l.principal) * 100) : 0);
  return { ...f, repaid, outstanding, settled, rate, monthly: settled ? 0 : f.monthly };
}
export const incomeFigures = (S, i, today) => scheduleFigures(S, i, today);

/* ---------- committees ---------- */
export const chitSlots = (c) => c.role === 'organizer' ? (c.members || []).reduce((s, m) => s + (num(m.slots) || 1), 0) : num(c.slots);
export function chitRound(c, no) {
  const r = (c.rounds && c.rounds[no]) || {};
  const pot = num(c.perSlot) * chitSlots(c);
  const has = (v) => v !== undefined && v !== null && v !== '';
  return {
    no, date: nthDate(c, no - 1), pot,
    installment: has(r.installment) ? num(r.installment) : num(c.perSlot),
    payout: has(r.payout) ? num(r.payout) : Math.max(0, pot - num(c.commission)),
    winner: r.winner || '', winnerName: r.winnerName || '', discount: num(r.discount)
  };
}
const sumT = (arr) => arr.reduce((s, t) => s + num(t.amount), 0);

export function chitFigures(S, c, today = todayISO()) {
  const n = chitSlots(c);
  const tx = S.txns.filter(t => t.refId === c.id);
  const org = c.role === 'organizer';
  const my = num(c.mySlots) || 1;
  const rounds = [];
  for (let no = 1; no <= n; no++) {
    const r = chitRound(c, no);
    const rt = tx.filter(t => t.round === no);
    const started = r.date <= today;
    if (!org) {
      r.due = r.installment * my;
      r.paid = sumT(rt.filter(t => t.kind === 'chit_pay'));
      r.received = sumT(rt.filter(t => t.kind === 'chit_win'));
      r.pending = started ? Math.max(0, round2(r.due - r.paid)) : 0;
      r.potPending = r.winner === 'me' && started ? Math.max(0, round2(r.payout - r.received)) : 0;
    } else {
      r.members = (c.members || []).map(m => {
        const due = r.installment * (num(m.slots) || 1);
        const paid = sumT(rt.filter(t => t.kind === 'chit_collect' && t.personId === m.personId));
        return { ...m, due, paid, left: Math.max(0, round2(due - paid)) };
      });
      r.due = r.members.reduce((s, m) => s + m.due, 0);
      r.paid = r.members.reduce((s, m) => s + m.paid, 0);
      r.pending = started ? r.members.reduce((s, m) => s + m.left, 0) : 0;
      r.paidOut = sumT(rt.filter(t => t.kind === 'chit_payout'));
      r.settled = r.paidOut > 0;
      r.potPending = r.winner && !r.settled && started ? r.payout : 0;
    }
    r.done = r.pending === 0 && r.potPending === 0 && r.date <= today ? true : (r.paid >= r.due && r.due > 0);
    rounds.push(r);
  }
  const f = { rounds, n };
  if (!org) {
    f.paidTotal = sumT(tx.filter(t => t.kind === 'chit_pay'));
    f.receivedTotal = sumT(tx.filter(t => t.kind === 'chit_win'));
    f.totalToPay = rounds.reduce((s, r) => s + r.due, 0);
    f.remaining = Math.max(0, round2(f.totalToPay - f.paidTotal));
    f.won = rounds.filter(r => r.winner === 'me');
    f.payNow = rounds.reduce((s, r) => s + r.pending, 0);
    f.collectNow = rounds.reduce((s, r) => s + r.potPending, 0);
    f.position = round2(f.paidTotal - f.receivedTotal);
  } else {
    f.collected = sumT(tx.filter(t => t.kind === 'chit_collect'));
    f.paidOut = sumT(tx.filter(t => t.kind === 'chit_payout'));
    f.held = rounds.filter(r => !r.settled).reduce((s, r) => s + r.paid, 0);
    f.commission = rounds.filter(r => r.settled).reduce((s, r) => s + r.paid - r.paidOut, 0);
    f.collectNow = rounds.reduce((s, r) => s + r.pending, 0);
    f.payNow = rounds.reduce((s, r) => s + r.potPending, 0);
    f.position = -round2(f.held);
  }
  f.next = rounds.find(r => (org ? r.paid < r.due : r.paid < r.due) || (r.winner && r.potPending > 0)) || null;
  f.finished = n > 0 && rounds.every(r => (org ? r.settled : r.paid >= r.due) && r.potPending === 0);
  return f;
}

/* ---------- names ---------- */
export const person = (S, id) => S.people.find(p => p.id === id);
export const personName = (S, id) => (person(S, id) || {}).name || '';
export function refLabel(S, id) {
  let x = S.loans.find(l => l.id === id); if (x) return personName(S, x.personId);
  x = S.incomes.find(i => i.id === id); if (x) return personName(S, x.personId) + (x.title ? ' · ' + x.title : '');
  x = S.committees.find(c => c.id === id); if (x) return x.name;
  return '';
}

/* ---------- dashboard summary ---------- */
export function summary(S, today = todayISO()) {
  const o = { accounts: 0, lent: 0, borrowed: 0, committee: 0, toCollect: 0, toPay: 0, monthlyIncome: 0, monthlyCost: 0 };
  o.accounts = round2(S.accounts.reduce((s, a) => s + accountBalance(S, a.id), 0));
  S.loans.forEach(l => {
    const f = loanFigures(S, l, today);
    if (l.dir === 'borrowed') { o.borrowed += f.outstanding; o.toPay += f.pending; o.monthlyCost += f.monthly; }
    else { o.lent += f.outstanding; o.toCollect += f.pending; o.monthlyIncome += f.monthly; }
  });
  S.incomes.forEach(i => { const f = scheduleFigures(S, i, today); o.toCollect += f.pending; o.monthlyIncome += f.monthly; });
  S.committees.forEach(c => { const f = chitFigures(S, c, today); o.committee += f.position; o.toCollect += f.collectNow; o.toPay += f.payNow; });
  o.other = round2(S.owners.reduce((s, w) => s + num(w.other), 0));
  o.tracked = round2(o.accounts + o.lent - o.borrowed + o.committee);
  o.worth = round2(o.tracked + o.other);
  return o;
}

export function monthStats(S, key) {
  const o = { in: 0, out: 0, earned: 0, spent: 0 };
  for (const t of S.txns) {
    if (!t.accountId || monthKey(t.date) !== key) continue;
    const c = txnClass(t); if (c === 'transfer' || c === 'adjust') continue;
    if (t.dir === 'in') o.in += num(t.amount); else o.out += num(t.amount);
    if (c === 'earn') o.earned += num(t.amount); if (c === 'spend') o.spent += num(t.amount);
  }
  return o;
}

// Where is the money? one row per account / borrower / committee
export function holdings(S, today = todayISO()) {
  const rows = [];
  S.accounts.forEach(a => { const b = accountBalance(S, a.id); if (b > 0) rows.push({ type: 'cash', label: a.name, amount: b, href: '#/cash' }); });
  const byPerson = {};
  S.loans.filter(l => l.dir !== 'borrowed').forEach(l => { const f = loanFigures(S, l, today); if (f.outstanding > 0) byPerson[l.personId] = (byPerson[l.personId] || 0) + f.outstanding; });
  Object.entries(byPerson).forEach(([pid, amt]) => rows.push({ type: 'lent', label: personName(S, pid), amount: amt, href: '#/people/' + pid }));
  S.committees.forEach(c => { const f = chitFigures(S, c, today); if (f.position > 0) rows.push({ type: 'committee', label: c.name, amount: f.position, href: '#/committees/' + c.id }); });
  return rows.sort((a, b) => b.amount - a.amount);
}

/* ---------- things needing attention ---------- */
export function attention(S, today = todayISO()) {
  const items = []; const soon = 7;
  const push = (i) => items.push(i);
  S.loans.forEach(l => {
    const push = (i) => items.push({ ...i, owner: l.ownerId });
    const f = loanFigures(S, l, today); const who = personName(S, l.personId); const href = '#/loans/' + l.id;
    const borrowed = l.dir === 'borrowed';
    if (f.pending > 0) push({ side: borrowed ? 'pay' : 'receive', title: who, sub: (borrowed ? 'Interest you owe' : 'Interest pending') + (f.oldBalance ? ' (old balance)' : ''), amount: f.pending, days: f.overdueDays, href, act: { type: 'loanPay', id: l.id } });
    else if (f.next && daysBetween(today, f.next) <= soon && !f.settled) push({ side: borrowed ? 'pay' : 'receive', title: who, sub: 'Interest ' + (borrowed ? 'to pay' : 'due') + ' ' + relDayText(today, f.next), amount: num(l.amount), days: -daysBetween(today, f.next), href, upcoming: true });
    if (l.dueDate && f.outstanding > 0 && daysBetween(today, l.dueDate) <= soon) push({ side: borrowed ? 'pay' : 'receive', title: who, sub: 'Loan return date ' + relDayText(today, l.dueDate), amount: f.outstanding, days: -daysBetween(today, l.dueDate), href });
  });
  S.incomes.forEach(i => {
    const push = (x) => items.push({ ...x, owner: i.ownerId });
    const f = scheduleFigures(S, i, today); const who = personName(S, i.personId) + (i.title ? ' · ' + i.title : ''); const href = '#/income/' + i.id;
    if (f.pending > 0) push({ side: 'receive', title: who, sub: 'Pending payment', amount: f.pending, days: f.overdueDays, href, act: { type: 'incPay', id: i.id } });
    else if (f.next && daysBetween(today, f.next) <= soon) push({ side: 'receive', title: who, sub: 'Next payment ' + relDayText(today, f.next), amount: num(i.amount), days: -daysBetween(today, f.next), href, upcoming: true });
  });
  S.committees.forEach(c => {
    const push = (x) => items.push({ ...x, owner: c.ownerId });
    const f = chitFigures(S, c, today); const href = '#/committees/' + c.id; const org = c.role === 'organizer';
    f.rounds.forEach(r => {
      const d = daysBetween(r.date, today);
      if (r.pending > 0) push({ side: org ? 'receive' : 'pay', title: c.name, sub: `Round ${r.no} · ${org ? 'to collect' : 'installment due'}`, amount: r.pending, days: d, href });
      else if (!r.done && d < 0 && d >= -soon && (org || r.paid < r.due)) push({ side: org ? 'receive' : 'pay', title: c.name, sub: `Round ${r.no} installment ${relDayText(today, r.date)}`, amount: r.due - r.paid, days: d, href, upcoming: true });
      if (r.potPending > 0) push({ side: org ? 'pay' : 'receive', title: c.name, sub: `Round ${r.no} · ${org ? 'pay out pot' : 'pot to receive'}`, amount: r.potPending, days: d, href });
    });
  });
  return items.sort((a, b) => (a.upcoming ? 1 : 0) - (b.upcoming ? 1 : 0) || b.days - a.days);
}
function relDayText(today, iso) { const n = daysBetween(today, iso); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : `${-n} days ago`; }

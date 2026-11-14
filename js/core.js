// Tiny UI framework: hash router, event delegation, bottom sheets, toasts.
import { esc } from './util.js';

export const ui = { sheet: null, q: {}, open: {}, drawer: false, toastTimer: null, locked: false, routeKey: '' };
export const views = {}, actions = {}, sheets = {}, inputs = {};
const hooks = { icon: null, nav: [] };
export function configure(o) { Object.assign(hooks, o); }

export const parseRoute = () => {
  const [tab = 'home', id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { tab: tab || 'home', id: id ? decodeURIComponent(id) : null, sub: sub || null };
};
export const go = (path) => { location.hash = '#/' + path; };

export function render() {
  if (ui.locked) return;
  const r = parseRoute();
  const v = (views[r.tab] || views.home)(r);
  const key = r.tab + '/' + (r.id || '');
  const ae = document.activeElement;
  const keep = ae && ae.id && ae.dataset && ae.dataset.input ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const y = ui.routeKey === key ? window.scrollY : 0;
  const nav = hooks.nav.map(n => `<a href="#/${n.id}" class="${r.tab === n.id ? 'active' : ''}">${hooks.icon(n.icon)}<span>${n.label}</span></a>`).join('');
  document.getElementById('app').innerHTML = `
    <div class="scrim ${ui.drawer ? 'open' : ''}" data-act="drawer"></div>
    <aside class="drawer ${ui.drawer ? 'open' : ''}" aria-label="Menu">
      <div class="brand"><i>₹</i>Money Register</div>
      ${hooks.who ? hooks.who() : ''}
      <nav>${nav}</nav><div class="sp"></div>
      <nav><a href="#/settings" class="${r.tab === 'settings' ? 'active' : ''}">${hooks.icon('sliders')}<span>Settings</span></a></nav>
    </aside>
    <main class="main">
      <header class="top">
        <button class="iconbtn" data-act="drawer" aria-label="Open menu">${hooks.icon('menu')}</button>
        <h1>${esc(v.title)}</h1>${v.right || ''}
      </header>
      ${v.back ? `<a class="backlink" href="${v.back}">‹ ${esc(v.backLabel || 'Back')}</a>` : ''}
      ${v.html}
    </main>`;
  ui.routeKey = key;
  window.scrollTo(0, y);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) { } } }
}
actions.drawer = () => { ui.drawer = !ui.drawer; render(); };
inputs.scopeSel = (el) => { if (hooks.onScope) hooks.onScope(el.value); };

/* ---------- sheets ---------- */
export function openSheet(name, params = {}) { ui.sheet = { name, params }; renderSheet(true); }
export function closeSheet() { ui.sheet = null; renderSheet(); }
export function renderSheet(focus) {
  const root = document.getElementById('sheet-root');
  if (!ui.sheet) { root.innerHTML = ''; return; }
  const def = sheets[ui.sheet.name]; const p = ui.sheet.params;
  const st = root.querySelector('.sheet') ? root.querySelector('.sheet').scrollTop : 0;
  const body = def.body(p);
  const foot = def.raw ? '' : `<div class="sheet-actions">${def.noCancel ? '' : `<button type="button" class="btn ghost" data-act="closeSheet">Cancel</button>`}<button type="submit" class="btn ${def.tone || 'green'}">${esc(def.submit_label ? def.submit_label(p) : 'Save')}</button></div>`;
  root.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-head"><h2>${esc(typeof def.title === 'function' ? def.title(p) : def.title)}</h2><button type="button" data-act="closeSheet" aria-label="Close">×</button></div>
    ${def.raw ? body : `<form data-sheet-form autocomplete="off">${body}${foot}</form>`}</div></div>`;
  root.querySelector('.sheet').scrollTop = focus ? 0 : st;
  if (def.onOpen) def.onOpen(root.querySelector('.sheet'), p);
  if (focus) { const f = root.querySelector('input:not([type=hidden]):not([type=checkbox]),select'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); }
}
export function commit(save) {
  save();
  render();
  if (ui.sheet && sheets[ui.sheet.name].live) renderSheet();
}

export function toast(msg, undo) {
  const el = document.getElementById('toast');
  clearTimeout(ui.toastTimer);
  el.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? '<button data-act="undo">Undo</button>' : ''}</div>`;
  ui.undoFn = undo || null;
  ui.toastTimer = setTimeout(() => { el.innerHTML = ''; ui.undoFn = null; }, undo ? 7000 : 3200);
}
actions.undo = () => { if (ui.undoFn) { ui.undoFn(); ui.undoFn = null; document.getElementById('toast').innerHTML = ''; } };
actions.closeSheet = closeSheet;
actions.sheet = (d) => openSheet(d.sheet, d);

export function confirmDlg({ title, body, ok = 'Yes, do it', danger = true, run }) {
  ui.confirmRun = run; openSheet('confirm', { title, body, ok, danger });
}
sheets.confirm = {
  title: (p) => p.title, noCancel: false, tone: 'red',
  submit_label: (p) => p.ok,
  body: (p) => `<p>${esc(p.body)}</p>`,
  submit() { const f = ui.confirmRun; ui.confirmRun = null; closeSheet(); if (f) f(); return false; }
};

/* ---------- events ---------- */
export function bindEvents() {
  document.addEventListener('click', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('overlay')) { closeSheet(); return; }
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const fn = actions[el.dataset.act]; if (!fn) return;
    ev.preventDefault(); fn(el.dataset, el, ev);
  });
  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-sheet-form]'); if (!form || !ui.sheet) return;
    ev.preventDefault();
    const cur = ui.sheet, def = sheets[cur.name];
    const res = def.submit(Object.fromEntries(new FormData(form)), cur.params, form);
    if (res !== false && ui.sheet === cur) closeSheet();
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-input]'); if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, ev);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ui.sheet) closeSheet(); });
  document.addEventListener('toggle', (ev) => { const d = ev.target; if (d.dataset && d.dataset.keep) ui.open[d.dataset.keep] = d.open; }, true);
  window.addEventListener('hashchange', () => { ui.drawer = false; if (ui.sheet) closeSheet(); render(); });
}

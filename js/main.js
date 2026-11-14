import { configure, bindEvents, render, openSheet, ui, actions } from './core.js';
import { load, S, hashPin, save, setScope } from './store.js';
import { icon, NAV, whoSwitcher } from './kit.js';
import './sheets.js';
import './views-main.js';
import './views-dues.js';
import { applyTheme } from './views-more.js';

applyTheme();
configure({ icon, nav: NAV, who: whoSwitcher, onScope: (v) => { if (v === '__add') { ui.drawer = false; render(); openSheet('owner'); } else { setScope(v); ui.drawer = false; render(); } } });
bindEvents();
const boot = load();

function lockScreen() {
  ui.locked = true;
  document.getElementById('app').innerHTML = `<div class="lock"><form class="box" id="lock-form"><h1>Money Register</h1><div class="muted">Enter your PIN</div>
    <input id="lock-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" autofocus><button class="btn full" type="submit">Unlock</button><div id="lock-err" class="neg small" style="margin-top:10px"></div></form></div>`;
  document.getElementById('lock-form').onsubmit = async (e) => {
    e.preventDefault();
    const h = await hashPin(document.getElementById('lock-pin').value, S.settings.pinSalt);
    if (h === S.settings.pinHash) { ui.locked = false; render(); } else { document.getElementById('lock-err').textContent = 'Wrong PIN'; document.getElementById('lock-pin').value = ''; }
  };
}
actions.lock = () => lockScreen();

if (S.settings.pinHash) lockScreen(); else render();
if (!S.settings.onboarded && !ui.locked) { S.settings.onboarded = true; save(); setTimeout(() => openSheet('welcome', { migrated: boot.migrated }), 150); }

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

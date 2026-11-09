import { formatVolume, message } from './i18n.js';
import { ruleKey, rulePrefix } from './rules.js';
import { validVolume } from './tab-state.js';

const scopes = ['host', 'path', 'query'];
const scopeLabels = {
  host: 'scope_host',
  path: 'scope_path',
  query: 'scope_query'
};

export async function readPresets() {
  const stored = await chrome.storage.local.get(null);
  const records = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(rulePrefix) || !validVolume(value?.volume)) continue;
    try {
      const [scope, host, path, params] = JSON.parse(key.slice(rulePrefix.length));
      if (!scopes.includes(scope) || typeof host !== 'string' || typeof path !== 'string' ||
          !Array.isArray(params) || !params.every(pair => Array.isArray(pair) &&
            pair.length === 2 && pair.every(part => typeof part === 'string'))) continue;
      records.push({ key, scope, host, path, params, volume: value.volume, savedAt: value.savedAt ?? 0 });
    } catch {
      // An unreadable record must not hide valid settings.
    }
  }
  return records.sort((left, right) =>
    left.host.localeCompare(right.host) ||
    scopes.indexOf(left.scope) - scopes.indexOf(right.scope) ||
    right.params.length - left.params.length || right.savedAt - left.savedAt
  );
}

export function savePreset(rule, volume) {
  return chrome.storage.local.set({ [ruleKey(rule)]: { volume, savedAt: Date.now() } });
}

export function deletePreset(key) {
  return chrome.storage.local.remove(key);
}

export function presetsChanged(changes) {
  return Object.keys(changes).some(key => key.startsWith(rulePrefix));
}

function ruleLabel({ host, path, params }) {
  const part = value => /[&=\s"\\]/u.test(value) ? JSON.stringify(value) : value;
  const query = params.map(([name, value]) => part(name) + '=' + part(value)).join('&');
  return host + path + (query ? '?' + query : '');
}

const rowTemplate = document.createElement('template');
rowTemplate.innerHTML = `
  <li class="row saved">
    <div class="saved-copy"><strong></strong><p class="muted"></p></div>
    <div class="saved-controls">
      <span class="apply-check" aria-hidden="true">✓</span>
      <button type="button" data-action="apply"></button>
      <button type="button" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12M6 4V2h4v2m2 0-1 10H5L4 4m3 3v4m2-4v4"/></svg>
      </button>
    </div>
  </li>`;

export function renderPresets(list, records, onDelete, onApply) {
  const rows = records.map(record => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const condition = ruleLabel(record);
    const label = message('rule_volume', [message(scopeLabels[record.scope]), formatVolume(record.volume)]);
    row.querySelector('strong').textContent = label;
    row.querySelector('p').textContent = condition;

    const apply = row.querySelector('[data-action="apply"]');
    const check = row.querySelector('.apply-check');
    if (onApply) {
      apply.textContent = message('apply');
      apply.setAttribute('aria-label', message('apply_rule', [label, condition]));
      apply.addEventListener('click', () => onApply(record, check));
    } else {
      apply.remove();
      check.remove();
    }

    const remove = row.querySelector('[data-action="delete"]');
    remove.title = message('delete');
    remove.setAttribute('aria-label', message('delete_rule', condition));
    remove.addEventListener('click', () => onDelete(record));
    return row;
  });
  list.replaceChildren(...rows);
}

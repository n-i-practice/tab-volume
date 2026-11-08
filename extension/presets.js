import { validVolume } from './tab-state.js';

const prefix = 'volume-rule:';
const scopes = ['host', 'path', 'query'];
const scopeLabels = {
  host: 'ホスト',
  path: 'パス',
  query: 'パス＋選択したクエリパラメータ'
};

export function createRule(url, scope, names) {
  const params = scope === 'query'
    ? [...names].sort().map(name => [name, url.searchParams.get(name)])
    : [];
  return { scope, host: url.hostname, path: scope === 'host' ? '' : url.pathname, params };
}

export function matchesRule(rule, url) {
  return !!url && rule.host === url.hostname &&
    (rule.scope === 'host' || rule.path === url.pathname) &&
    rule.params.every(([name, value]) => {
      const values = url.searchParams.getAll(name);
      return values.length === 1 && values[0] === value;
    });
}

export async function readPresets() {
  const stored = await chrome.storage.local.get(null);
  const records = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(prefix) || !validVolume(value?.volume)) continue;
    try {
      const [scope, host, path, params] = JSON.parse(key.slice(prefix.length));
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
  const key = prefix + JSON.stringify([rule.scope, rule.host, rule.path, rule.params]);
  return chrome.storage.local.set({ [key]: { volume, savedAt: Date.now() } });
}

export function deletePreset(key) {
  return chrome.storage.local.remove(key);
}

export function presetsChanged(changes) {
  return Object.keys(changes).some(key => key.startsWith(prefix));
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
      <button type="button" data-action="apply">適用</button>
      <button type="button" data-action="delete" title="削除">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12M6 4V2h4v2m2 0-1 10H5L4 4m3 3v4m2-4v4"/></svg>
      </button>
    </div>
  </li>`;

export function renderPresets(list, records, onDelete, onApply) {
  const rows = records.map(record => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const condition = ruleLabel(record);
    const label = scopeLabels[record.scope] + '：' + record.volume + '%';
    row.querySelector('strong').textContent = label;
    row.querySelector('p').textContent = condition;

    const apply = row.querySelector('[data-action="apply"]');
    const check = row.querySelector('.apply-check');
    if (onApply) {
      apply.setAttribute('aria-label', condition + ' の ' + label + ' を適用');
      apply.addEventListener('click', () => onApply(record, check));
    } else {
      apply.remove();
      check.remove();
    }

    const remove = row.querySelector('[data-action="delete"]');
    remove.setAttribute('aria-label', condition + ' の保存条件を削除');
    remove.addEventListener('click', () => onDelete(record));
    return row;
  });
  list.replaceChildren(...rows);
}

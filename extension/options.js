import { localizePage, message } from './i18n.js';
import { deletePreset, presetsChanged, readPresets, renderPresets } from './presets.js';

const list = document.getElementById('all-saved-list');
const empty = document.getElementById('all-saved-empty');
const error = document.getElementById('all-saved-error');
let version = 0;

async function refresh() {
  const current = ++version;
  try {
    const records = await readPresets();
    if (current !== version) return;
    error.textContent = '';
    empty.hidden = records.length > 0;
    renderPresets(list, records, remove);
  } catch {
    if (current !== version) return;
    list.replaceChildren();
    empty.hidden = true;
    error.textContent = message('load_settings_failed');
  }
}

async function remove(record) {
  try {
    await deletePreset(record.key);
  } catch {
    error.textContent = message('delete_failed');
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && presetsChanged(changes)) void refresh();
});
localizePage();
void refresh();

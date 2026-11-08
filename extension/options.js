import { languageKey, localizePage, message, selectLanguage } from './i18n.js';
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

async function applyLanguage(preference) {
  if (await selectLanguage(preference) === null) return;
  localizePage();
  await refresh();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[languageKey]) {
    void applyLanguage(changes[languageKey].newValue).catch(console.error);
  } else if (presetsChanged(changes)) {
    void refresh();
  }
});
chrome.storage.local.get(languageKey)
  .then(values => applyLanguage(values[languageKey]))
  .catch(() => applyLanguage());

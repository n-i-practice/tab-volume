import { formatVolume, languageKey, localizePage, message, selectLanguage } from './i18n.js';
import { defaultState, pageUrl } from './tab-state.js';
import { deletePreset, presetsChanged, readPresets, renderPresets, savePreset } from './presets.js';
import { createRule, matchesRule } from './rules.js';

const find = id => document.getElementById(id);
const slider = find('volume');
const mute = find('mute');
const queryItems = find('query-items');
const savedList = find('saved-list');
const tickPattern = find('tick-pattern');
const darkMode = find('dark-mode');
const languageSelect = find('language');
const tickKey = 'display:tick-step';
const darkKey = 'display:dark-mode';
const checkTimers = new WeakMap();

let tabId;
let url;
let pageMode = 'loading';
let confirmed = defaultState;
let requested;
let failure;
let records = [];
let rulesVersion = 0;
let pageVersion = 0;
let saveTimer;
let announcementTimer;
let languagePreference;

function formRule() {
  if (!url) return null;
  const scope = document.querySelector('input[name="scope"]:checked').value;
  const names = [...queryItems.querySelectorAll('input:checked')].map(input => input.value);
  find('queries').hidden = scope !== 'query';
  return scope === 'query' && names.length === 0 ? null : createRule(url, scope, names);
}

function render() {
  const state = requested?.settings ?? confirmed;
  const supported = pageMode === 'supported';
  const canAdjust = supported || (pageMode === 'lost' && confirmed.active);
  const locked = !canAdjust || failure?.conflict === true;
  const resetting = requested?.action === 'reset';
  const starting = requested && !confirmed.active && (state.muted || state.volume !== 100);
  const notice = {
    loading: 'checking_tab',
    unsupported: 'unsupported',
    lost: confirmed.active ? 'page_changed_settings' : 'page_changed_adjustment'
  };
  let noticeKey = notice[pageMode];
  if (supported && starting) noticeKey = 'capture_starting';
  if (supported && failure) {
    noticeKey = failure.conflict ? 'capture_conflict' : 'apply_failed';
  }

  const volumeText = formatVolume(state.volume);
  slider.value = state.volume;
  slider.setAttribute('aria-valuetext', volumeText);
  find('amount').value = canAdjust ? volumeText : '—';
  find('volume-slider').disabled = locked || resetting || state.muted;
  find('reset').disabled = locked;
  mute.disabled = locked || resetting;
  mute.classList.toggle('is-muted', state.muted);
  find('mute-label').textContent = message(state.muted ? 'unmute' : 'mute');
  find('boost-note').hidden = !canAdjust || state.volume <= 100;
  find('capture-notice').hidden = !noticeKey;
  find('capture-message').textContent = noticeKey ? message(noticeKey) : '';
  find('retry').hidden = !supported || !failure;
  find('saved-area').hidden = !supported;
  find('save-area').hidden = !supported;

  const canSave = supported && !requested && !failure;
  const rule = formRule();
  find('save').disabled = !canSave || !rule;
  for (const button of savedList.querySelectorAll('[data-action="apply"]')) {
    button.disabled = !canSave;
  }
}

function renderRules() {
  const matches = records.filter(record => matchesRule(record, url));
  find('saved-empty').hidden = matches.length > 0;
  renderPresets(savedList, matches, removeRule, applyRule);
  render();
}

async function refreshRules() {
  const version = ++rulesVersion;
  try {
    const latest = await readPresets();
    if (version !== rulesVersion) return;
    records = latest;
    find('saved-error').textContent = '';
    renderRules();
  } catch {
    if (version === rulesVersion) {
      find('saved-empty').hidden = true;
      find('saved-error').textContent = message('load_settings_failed');
    }
  }
}

function showPage(nextUrl, mode) {
  if (nextUrl?.href === url?.href && mode === pageMode) return;
  url = nextUrl;
  pageMode = mode;
  failure = undefined;
  clearTimeout(saveTimer);
  clearTimeout(announcementTimer);
  find('save-status').textContent = '';
  find('apply-announcement').textContent = '';
  find('address').textContent = url?.href ?? '';
  find('save-area').open = false;
  document.querySelector('[name="scope"][value="host"]').checked = true;
  find('queries').hidden = true;
  queryItems.replaceChildren();
  if (url) {
    find('host-detail').textContent = url.hostname;
    find('path-detail').textContent = url.hostname + url.pathname;
    for (const name of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(name);
      const label = document.createElement('label');
      label.className = 'query-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      input.disabled = values.length !== 1;
      label.append(input, document.createElement('span'));
      queryItems.append(label);
    }
  }
  updateQueryLabels();
  renderRules();
}

function updateQueryLabels() {
  for (const input of queryItems.querySelectorAll('input')) {
    const name = input.value;
    input.nextElementSibling.textContent = input.disabled
      ? message('duplicate_query', name)
      : name + '=' + url.searchParams.get(name);
  }
  const canSelectQuery = !!queryItems.querySelector('input:not(:disabled)');
  document.querySelector('[name="scope"][value="query"]').disabled = !canSelectQuery;
  find('query-detail').textContent = message(canSelectQuery ? 'query_match_detail' : 'no_query_fields');
}

async function refreshPage() {
  const version = ++pageVersion;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (version !== pageVersion) return null;
  const nextUrl = pageUrl(tab?.url);
  const hadAccess = pageMode === 'supported' || pageMode === 'lost';
  const mode = nextUrl ? 'supported' : hadAccess && !tab?.url ? 'lost' : 'unsupported';
  showPage(nextUrl, mode);
  return nextUrl;
}

async function readAudio() {
  const result = await chrome.runtime.sendMessage({ receiver: 'worker', action: 'status', tabId });
  if (!result?.state) throw new Error(result?.error ?? message('audio_no_response'));
  return result.state;
}

function announceApplied(check, volume) {
  if (check.isConnected) {
    check.classList.add('is-visible');
    clearTimeout(checkTimers.get(check));
    checkTimers.set(check, setTimeout(() => check.classList.remove('is-visible'), 2000));
  }
  const announcement = find('apply-announcement');
  clearTimeout(announcementTimer);
  announcement.textContent = '';
  announcementTimer = setTimeout(() => {
    announcement.textContent = message('applied_volume', formatVolume(volume));
  }, 100);
}

async function changeAudio(volume, muted, { preset, action = 'set' } = {}) {
  const settings = { volume, muted, url: url?.href ?? null };
  const request = { settings, action };
  requested = request;
  failure = undefined;
  render();

  let conflict = false;
  try {
    const result = await chrome.runtime.sendMessage({
      receiver: 'worker', action, tabId, settings
    });
    if (requested !== request) return;
    if (!result?.state) {
      conflict = result?.conflict === true;
      throw new Error(result?.error ?? message('audio_no_response'));
    }
    confirmed = result.state;
    if (preset && url?.href === settings.url) announceApplied(preset.check, confirmed.volume);
  } catch (error) {
    if (requested !== request) return;
    console.error(error);
    const latest = await readAudio().catch(() => confirmed);
    if (requested !== request) return;
    confirmed = latest;
    if (url?.href === settings.url) failure = { settings, preset, conflict, action };
  } finally {
    if (requested === request) {
      requested = undefined;
      render();
    }
  }
}

function setVolume(volume) {
  return changeAudio(volume, (requested?.settings ?? confirmed).muted);
}

async function applyRule(record, check) {
  const current = await refreshPage();
  if (!matchesRule(record, current) || requested || failure) return;
  await changeAudio(record.volume, confirmed.muted, { preset: { record, check } });
}

async function retry() {
  const failed = failure;
  if (!failed) return;
  const current = await refreshPage();
  if (failure !== failed || !current) return;
  if (failed.settings.url !== current.href) return;
  if (failed.preset && !matchesRule(failed.preset.record, current)) return;
  await changeAudio(failed.settings.volume, failed.settings.muted, { preset: failed.preset, action: failed.action });
}

async function removeRule(record) {
  if (!matchesRule(record, await refreshPage())) return;
  try {
    await deletePreset(record.key);
  } catch {
    find('saved-error').textContent = message('delete_failed');
  }
}

async function save() {
  const rule = formRule();
  if (!rule || !matchesRule(rule, await refreshPage()) || requested || failure) return;
  const status = find('save-status');
  clearTimeout(saveTimer);
  try {
    await savePreset(rule, confirmed.volume);
    status.classList.remove('is-error');
    status.textContent = message('saved');
    saveTimer = setTimeout(() => { status.textContent = ''; }, 2000);
  } catch {
    status.classList.add('is-error');
    status.textContent = message('save_failed');
  }
}

function renderScale() {
  const scale = find('volume-scale');
  const step = Number(tickPattern.value);
  const majorStep = step === 10 ? 50 : 100;
  const max = Number(slider.max);
  scale.replaceChildren();
  for (let value = 0; value <= max; value += step) {
    const tick = document.createElement('span');
    tick.style.setProperty('--position', (value / max * 100) + '%');
    tick.classList.toggle('minor-tick', value % majorStep !== 0);
    if (value % 100 === 0) {
      const label = document.createElement('button');
      label.type = 'button';
      label.textContent = formatVolume(value);
      label.setAttribute('aria-label', message('set_volume', label.textContent));
      label.addEventListener('click', () => setVolume(value));
      tick.append(label);
    }
    scale.append(tick);
  }
}

function renderTheme() {
  find('popup').dataset.theme = darkMode.checked ? 'dark' : 'light';
}

async function loadOptions() {
  const values = await chrome.storage.local.get([tickKey, darkKey]);
  tickPattern.value = values[tickKey] === '10' ? '10' : '50';
  darkMode.checked = values[darkKey] === true;
  renderTheme();
  renderScale();
}

async function saveOption(key, value) {
  const status = find('options-status');
  try {
    await chrome.storage.local.set({ [key]: value });
    status.textContent = '';
  } catch {
    status.textContent = message('display_save_failed');
    await loadOptions().catch(console.error);
  }
}

async function applyLanguage(preference) {
  const selected = await selectLanguage(preference);
  if (selected === null) return;
  languagePreference = selected;
  languageSelect.value = selected;
  localizePage();
  clearTimeout(saveTimer);
  clearTimeout(announcementTimer);
  find('save-status').textContent = '';
  find('apply-announcement').textContent = '';
  find('language-status').textContent = '';
  updateQueryLabels();
  renderScale();
  renderRules();
}

languageSelect.addEventListener('change', async () => {
  const previous = languagePreference;
  languageSelect.disabled = true;
  try {
    await applyLanguage(languageSelect.value);
    await chrome.storage.local.set({ [languageKey]: languagePreference });
  } catch {
    await applyLanguage(previous);
    find('language-status').textContent = message('language_change_failed');
  } finally {
    languageSelect.disabled = false;
  }
});

slider.addEventListener('input', () => setVolume(Number(slider.value)));
find('reset').addEventListener('click', () => changeAudio(100, false, { action: 'reset' }));
mute.addEventListener('click', () => {
  const state = requested?.settings ?? confirmed;
  void changeAudio(state.volume, !state.muted);
});
find('retry').addEventListener('click', retry);
find('save').addEventListener('click', save);
document.querySelectorAll('[name="scope"]').forEach(input => input.addEventListener('change', render));
queryItems.addEventListener('change', render);
tickPattern.addEventListener('change', () => {
  renderScale();
  void saveOption(tickKey, tickPattern.value);
});
darkMode.addEventListener('change', () => {
  renderTheme();
  void saveOption(darkKey, darkMode.checked);
});
find('open-options').addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    find('options-status').textContent = message('open_settings_failed');
  }
});

chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === tabId && (change.url !== undefined || change.status !== undefined)) void refreshPage();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.receiver !== 'popup' || message.action !== 'ended' || message.tabId !== tabId ||
      sender.url !== chrome.runtime.getURL('offscreen.html')) return;
  confirmed = defaultState;
  render();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (presetsChanged(changes)) void refreshRules();
  if (changes[languageKey] && !languageSelect.disabled) {
    void applyLanguage(changes[languageKey].newValue).catch(console.error);
  }
});

async function initialize() {
  try {
    const values = await chrome.storage.local.get(languageKey);
    await applyLanguage(values[languageKey]);
  } catch {
    await applyLanguage();
    find('language-status').textContent = message('language_change_failed');
  }
  languageSelect.disabled = false;
  void loadOptions().catch(console.error);
  void refreshRules();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (tabId === undefined) {
    showPage(null, 'unsupported');
    return;
  }
  confirmed = await readAudio().catch(error => {
    console.error(error);
    return defaultState;
  });
  await refreshPage();
}

void initialize().catch(error => {
  console.error(error);
  showPage(null, 'unsupported');
});

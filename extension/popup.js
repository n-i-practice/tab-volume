import { defaultState, pageUrl } from './tab-state.js';
import { createRule, deletePreset, matchesRule, presetsChanged, readPresets, renderPresets, savePreset } from './presets.js';

const find = id => document.getElementById(id);
const slider = find('volume');
const mute = find('mute');
const queryItems = find('query-items');
const savedList = find('saved-list');
const tickPattern = find('tick-pattern');
const darkMode = find('dark-mode');
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

function formRule() {
  if (!url) return null;
  const scope = document.querySelector('input[name="scope"]:checked').value;
  const names = [...queryItems.querySelectorAll('input:checked')].map(input => input.value);
  find('queries').hidden = scope !== 'query';
  return scope === 'query' && names.length === 0 ? null : createRule(url, scope, names);
}

function render() {
  const state = requested ?? confirmed;
  const supported = pageMode === 'supported';
  const canAdjust = supported || (pageMode === 'lost' && confirmed.active);
  const locked = !canAdjust || failure?.conflict === true;
  const starting = requested && !confirmed.active && (requested.muted || requested.volume !== 100);
  const notice = {
    loading: 'タブを確認しています…',
    unsupported: 'このページでは音量調整を利用できません。',
    lost: confirmed.active
      ? 'ページが変わりました。保存設定を使うにはポップアップを開き直してください。'
      : 'ページが変わりました。音量を調整するにはポップアップを開き直してください。'
  };
  let message = notice[pageMode] ?? '';
  if (supported && starting) message = '音声キャプチャを開始しています…';
  if (supported && failure) {
    message = failure.conflict
      ? 'このタブは別のキャプチャで使用中です。共有や録画を終了してから再試行してください。'
      : '音量を適用できませんでした。再試行するか、音量を選び直してください。';
  }

  slider.value = state.volume;
  slider.setAttribute('aria-valuetext', state.volume + '%');
  find('amount').value = canAdjust ? state.volume + '%' : '—';
  find('volume-slider').disabled = locked || state.muted;
  find('reset').disabled = locked;
  mute.disabled = locked;
  mute.classList.toggle('is-muted', state.muted);
  find('mute-label').textContent = state.muted ? 'ミュート解除' : 'ミュート';
  find('boost-note').hidden = !canAdjust || state.volume <= 100;
  find('capture-notice').hidden = !message;
  find('capture-message').textContent = message;
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
      find('saved-error').textContent = '保存されている設定を読み込めませんでした。';
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
      label.append(input, input.disabled ? name + '（同名項目が複数）' : name + '=' + values[0]);
      queryItems.append(label);
    }
  }
  const canSelectQuery = !!queryItems.querySelector('input:not(:disabled)');
  document.querySelector('[name="scope"][value="query"]').disabled = !canSelectQuery;
  find('query-detail').textContent = canSelectQuery
    ? '選んだ名前と値がすべて一致する場合に適用可能'
    : '選べるクエリパラメータがありません';
  renderRules();
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
  if (!result?.state) throw new Error(result?.error ?? '音声処理から応答がありません。');
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
    announcement.textContent = '音量を ' + volume + '% に適用しました';
  }, 100);
}

async function changeAudio(volume, muted, preset) {
  const settings = { volume, muted, url: url?.href ?? null };
  requested = settings;
  failure = undefined;
  render();

  let conflict = false;
  try {
    const result = await chrome.runtime.sendMessage({
      receiver: 'worker', action: 'set', tabId, settings
    });
    if (requested !== settings) return;
    if (!result?.state) {
      conflict = result?.conflict === true;
      throw new Error(result?.error ?? '音声処理から応答がありません。');
    }
    confirmed = result.state;
    if (preset && url?.href === settings.url) announceApplied(preset.check, confirmed.volume);
  } catch (error) {
    if (requested !== settings) return;
    console.error(error);
    const latest = await readAudio().catch(() => confirmed);
    if (requested !== settings) return;
    confirmed = latest;
    if (url?.href === settings.url) failure = { settings, preset, conflict };
  } finally {
    if (requested === settings) {
      requested = undefined;
      render();
    }
  }
}

function setVolume(volume) {
  return changeAudio(volume, (requested ?? confirmed).muted);
}

async function applyRule(record, check) {
  const current = await refreshPage();
  if (!matchesRule(record, current) || requested || failure) return;
  await changeAudio(record.volume, confirmed.muted, { record, check });
}

async function retry() {
  const failed = failure;
  if (!failed) return;
  const current = await refreshPage();
  if (failure !== failed || !current) return;
  if (failed.settings.url !== current.href) return;
  if (failed.preset && !matchesRule(failed.preset.record, current)) return;
  await changeAudio(failed.settings.volume, failed.settings.muted, failed.preset);
}

async function removeRule(record) {
  if (!matchesRule(record, await refreshPage())) return;
  try {
    await deletePreset(record.key);
  } catch {
    find('saved-error').textContent = '設定を削除できませんでした。';
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
    status.textContent = '保存しました';
    saveTimer = setTimeout(() => { status.textContent = ''; }, 2000);
  } catch {
    status.classList.add('is-error');
    status.textContent = '設定を保存できませんでした。';
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
      label.textContent = value + '%';
      label.setAttribute('aria-label', '音量を ' + value + '% にする');
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
    status.textContent = '表示設定を保存できませんでした。';
    await loadOptions().catch(console.error);
  }
}

slider.addEventListener('input', () => setVolume(Number(slider.value)));
find('reset').addEventListener('click', () => setVolume(100));
mute.addEventListener('click', () => {
  const state = requested ?? confirmed;
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
    find('options-status').textContent = '設定一覧を開けませんでした。';
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
  if (area === 'local' && presetsChanged(changes)) void refreshRules();
});

async function initialize() {
  renderScale();
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

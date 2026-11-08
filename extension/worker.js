import { message } from './i18n.js';
import { defaultState, pageUrl, validVolume } from './tab-state.js';

const offscreenPath = 'offscreen.html';
const pending = new Map();
let opening;

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenPath)]
  });
  return contexts.length > 0;
}

function ensureOffscreen() {
  opening ??= (async () => {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
      url: offscreenPath,
      reasons: ['USER_MEDIA'],
      justification: message('audio_document_reason')
    });
  })().finally(() => { opening = undefined; });
  return opening;
}

async function offscreen(action, tabId, details = {}) {
  const result = await chrome.runtime.sendMessage({
    receiver: 'offscreen', action, tabId, ...details
  });
  if (result?.error === 'capture_ended') throw new Error(message('capture_ended'));
  if (!result || result.error) throw new Error(result?.error ?? message('audio_no_response'));
  return result;
}

async function runChanges(tabId, change) {
  let hasDocument = await hasOffscreen();
  let state = hasDocument ? await offscreen('status', tabId) : defaultState;

  while (true) {
    const requested = change.requested;
    if (state.active) {
      state = await offscreen('set', tabId, { settings: requested });
      if (!state.active) throw new Error(message('audio_processing_ended'));
    } else if (requested.muted || requested.volume !== 100) {
      const tab = await chrome.tabs.get(tabId);
      if (!pageUrl(tab.url) || tab.url !== requested.url) {
        throw new Error(message('target_page_changed'));
      }
      if (!hasDocument) {
        await ensureOffscreen();
        hasDocument = true;
      }
      if (change.requested !== requested) continue;
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      const current = await chrome.tabs.get(tabId);
      if (current.url !== requested.url) throw new Error(message('target_page_changed'));
      // A newer slider value may arrive while getUserMedia is opening the stream.
      state = await offscreen('start', tabId, { streamId, settings: change.requested });
    }
    if (change.requested === requested) return state;
  }
}

function changeVolume(tabId, settings) {
  const current = pending.get(tabId);
  if (current) {
    current.requested = settings;
    return current.result;
  }

  const change = { requested: settings };
  change.result = runChanges(tabId, change).finally(() => pending.delete(tabId));
  pending.set(tabId, change);
  return change.result;
}

async function getStatus(tabId) {
  await pending.get(tabId)?.result.catch(() => {});
  return await hasOffscreen() ? offscreen('status', tabId) : defaultState;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.receiver !== 'worker' || sender.url !== chrome.runtime.getURL('popup.html')) return;
  const { action, tabId, settings } = message;
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (action !== 'status' && action !== 'set') return;
  if (action === 'set' && (!validVolume(settings?.volume) || typeof settings.muted !== 'boolean')) return;

  const operation = action === 'set' ? changeVolume(tabId, settings) : getStatus(tabId);
  operation.then(state => respond({ state }), error => respond({
    error: error.message,
    conflict: /active stream|already captur/i.test(error.message)
  }));
  return true;
});

async function stopTab(tabId) {
  try {
    if (await hasOffscreen()) await offscreen('stop', tabId);
  } catch (error) {
    console.error(error);
  }
}

chrome.tabs.onRemoved.addListener(stopTab);
chrome.tabs.onReplaced.addListener((_added, removed) => stopTab(removed));

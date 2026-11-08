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

async function ensureOffscreen() {
  opening ??= (async () => {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
      url: offscreenPath,
      reasons: ['USER_MEDIA'],
      justification: 'Play captured tab audio through an adjustable gain node.'
    });
  })().finally(() => { opening = undefined; });
  await opening;
}

async function offscreen(action, tabId, details = {}) {
  const result = await chrome.runtime.sendMessage({
    receiver: 'offscreen', action, tabId, ...details
  });
  if (result.error) throw new Error(result.error);
  return result;
}

async function setVolume(tabId, volume) {
  if (await hasOffscreen()) {
    const state = await offscreen('set', tabId, { volume });
    if (state.active) return state;
  }
  if (volume === 100) return { active: false, volume };
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await chrome.tabs.get(tabId);
  return offscreen('start', tabId, { streamId, volume });
}

function queueVolume(tabId, volume) {
  const previous = pending.get(tabId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => setVolume(tabId, volume));
  pending.set(tabId, next);
  return next.finally(() => {
    if (pending.get(tabId) === next) pending.delete(tabId);
  });
}

async function status(tabId) {
  await pending.get(tabId)?.catch(() => {});
  return await hasOffscreen() ? offscreen('status', tabId) : { active: false, volume: 100 };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.receiver !== 'worker' || sender.url !== chrome.runtime.getURL('popup.html')) return;
  const { action, tabId, volume } = message;
  const result = action === 'set' ? queueVolume(tabId, volume) : status(tabId);
  result.then(respond, error => respond({ error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(async tabId => {
  try {
    if (await hasOffscreen()) await offscreen('stop', tabId);
  } catch (error) {
    console.error(error);
  }
});

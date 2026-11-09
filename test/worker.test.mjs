import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from '../extension/tab-state.js';

const page = 'https://example.com/watch?v=ABC';
const tabId = 1;

async function createWorker(t, { initialState = defaultState, url = page, getStreamId, beforeAudio } = {}) {
  const actions = [];
  let state = initialState;
  let hasDocument = state.active;
  let listener;
  const extensionUrl = path => 'chrome-extension://test/' + path;
  const event = { addListener() {} };

  globalThis.chrome = {
    i18n: { getMessage: key => key === 'page_language' ? 'en' : key },
    runtime: {
      getURL: extensionUrl,
      getContexts: async () => hasDocument ? [{}] : [],
      onInstalled: event,
      onMessage: { addListener: callback => { listener = callback; } },
      async sendMessage({ action, settings }) {
        if (action !== 'status') actions.push(action);
        await beforeAudio?.(action);
        if (action === 'start' || action === 'set') {
          state = { active: true, volume: settings.volume, muted: settings.muted };
        } else if (action === 'stop') {
          state = defaultState;
        }
        return state;
      }
    },
    offscreen: { async createDocument() { hasDocument = true; } },
    tabs: { get: async () => ({ url }), onRemoved: event, onReplaced: event },
    tabCapture: {
      async getMediaStreamId() {
        actions.push('stream-id');
        await getStreamId?.();
        return 'stream-id';
      }
    }
  };
  t.after(() => { delete globalThis.chrome; });
  await import('../extension/worker.js?' + encodeURIComponent(t.name));

  const request = (action, settings) => new Promise(resolve => {
    assert.equal(listener({ receiver: 'worker', action, tabId, settings }, { url: extensionUrl('popup.html') }, resolve), true);
  });
  return {
    actions,
    setUrl: value => { url = value; },
    set: (volume, url = page) => request('set', { volume, muted: false, url }),
    reset: () => request('reset'),
    status: () => request('status')
  };
}

test('capture compares canonical URLs and ignores fragment changes before and after requesting a stream ID', async t => {
  const worker = await createWorker(t, {
    url: page + '#one',
    getStreamId: () => worker.setUrl(page + '#two')
  });
  assert.deepEqual(await worker.set(50, 'https://EXAMPLE.com:443/watch?v=ABC#original'), {
    state: { active: true, volume: 50, muted: false }
  });
  assert.deepEqual(worker.actions, ['stream-id', 'start']);
});

test('capture stops before asking for an ID if the page or permission has changed', async t => {
  const worker = await createWorker(t);
  for (const url of ['https://example.com:444/watch?v=ABC', 'https://example.com/other?v=ABC', undefined]) {
    worker.setUrl(url);
    assert.equal((await worker.set(50)).error, 'target_page_changed');
  }
  assert.deepEqual(worker.actions, []);
});

test('capture stops before using the stream ID if the query changes', async t => {
  const worker = await createWorker(t, {
    getStreamId: () => worker.setUrl('https://example.com/watch?v=XYZ')
  });
  assert.equal((await worker.set(50)).error, 'target_page_changed');
  assert.deepEqual(worker.actions, ['stream-id']);
});

test('rapid slider changes start one stream and use the latest value', async t => {
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const worker = await createWorker(t, {
    getStreamId() { entered.resolve(); return resume.promise; }
  });
  const first = worker.set(90);
  await entered.promise;
  const updates = [80, 70, 60, 50].map(volume => worker.set(volume));
  resume.resolve();
  const replies = await Promise.all([first, ...updates]);
  for (const reply of replies) assert.deepEqual(reply, { state: { active: true, volume: 50, muted: false } });
  assert.deepEqual(worker.actions.filter(action => action !== 'set'), ['stream-id', 'start']);
});

for (const action of ['start', 'set']) {
  test(`reset waits for an in-flight ${action} and stops the session`, async t => {
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const worker = await createWorker(t, {
      initialState: action === 'start' ? defaultState : { active: true, volume: 70, muted: false },
      beforeAudio(current) {
        if (current !== action) return;
        entered.resolve();
        return resume.promise;
      }
    });
    const volume = worker.set(50);
    await entered.promise;
    const reset = worker.reset();
    const status = worker.status();
    resume.resolve();
    await volume;
    assert.deepEqual(await reset, { state: defaultState });
    assert.deepEqual(await status, { state: defaultState });
    assert.deepEqual(worker.actions, action === 'start' ? ['stream-id', 'start', 'stop'] : ['set', 'stop']);
  });
}

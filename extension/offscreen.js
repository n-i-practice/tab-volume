import { defaultState } from './tab-state.js';

const sessions = new Map();

function status(tabId) {
  return sessions.get(tabId)?.state ?? defaultState;
}

function setGain(session, { volume, muted }, smooth) {
  const gain = session.gain.gain;
  const target = muted ? 0 : volume / 100;
  if (smooth) {
    const now = session.context.currentTime;
    gain.cancelAndHoldAtTime(now);
    gain.linearRampToValueAtTime(target, now + 0.025);
  } else {
    gain.value = target;
  }
  session.state = { active: true, volume, muted };
  return session.state;
}

async function release(session) {
  session.stream?.getTracks().forEach(track => track.stop());
  if (session.context && session.context.state !== 'closed') await session.context.close();
}

async function stop(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);
  await release(session);
}

function onTrackEnded(tabId, session) {
  if (sessions.get(tabId) !== session) return;
  stop(tabId).catch(console.error);
  chrome.runtime.sendMessage({ receiver: 'popup', action: 'ended', tabId }).catch(() => {});
}

async function start({ tabId, streamId, settings }) {
  const session = {};
  sessions.set(tabId, session);
  try {
    session.stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });
    const tracks = session.stream.getAudioTracks();
    if (sessions.get(tabId) !== session || !tracks.some(track => track.readyState === 'live')) {
      throw new Error('タブのキャプチャが終了しました。');
    }
    for (const track of tracks) {
      track.addEventListener('ended', () => onTrackEnded(tabId, session), { once: true });
    }

    session.context = new AudioContext();
    const source = session.context.createMediaStreamSource(session.stream);
    session.gain = session.context.createGain();
    session.gain.gain.value = settings.muted ? 0 : settings.volume / 100;
    source.connect(session.gain).connect(session.context.destination);
    await session.context.resume();
    if (sessions.get(tabId) !== session) throw new Error('タブのキャプチャが終了しました。');
    return setGain(session, settings, false);
  } catch (error) {
    if (sessions.get(tabId) === session) sessions.delete(tabId);
    await release(session);
    throw error;
  }
}

async function handle(message) {
  const { action, tabId, settings } = message;
  if (action === 'start') return start(message);
  if (action === 'stop') await stop(tabId);
  if (action === 'set') {
    const session = sessions.get(tabId);
    if (session?.state) return setGain(session, settings, true);
  }
  return status(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.receiver !== 'offscreen' || sender.url !== chrome.runtime.getURL('worker.js')) return;
  handle(message).then(respond, error => respond({ error: error.message }));
  return true;
});

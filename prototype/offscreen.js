const sessions = new Map();

function status(tabId) {
  const session = sessions.get(tabId);
  if (!session?.gain) return { active: false, volume: 100 };
  return { active: true, volume: Math.round(session.gain.gain.value * 100) };
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

async function start({ tabId, streamId, volume }) {
  const session = {};
  sessions.set(tabId, session);
  try {
    session.stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });
    if (sessions.get(tabId) !== session) throw new Error('タブのキャプチャが終了しました');
    for (const track of session.stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (sessions.get(tabId) === session) stop(tabId).catch(console.error);
      }, { once: true });
    }
    session.context = new AudioContext();
    const source = session.context.createMediaStreamSource(session.stream);
    session.gain = session.context.createGain();
    session.gain.gain.value = volume / 100;
    source.connect(session.gain).connect(session.context.destination);
    await session.context.resume();
    if (sessions.get(tabId) !== session) throw new Error('タブのキャプチャが終了しました');
    return status(tabId);
  } catch (error) {
    if (sessions.get(tabId) === session) sessions.delete(tabId);
    await release(session);
    throw error;
  }
}

async function handle(message) {
  const { action, tabId, volume } = message;
  if (action === 'start') return start(message);
  if (action === 'stop') {
    await stop(tabId);
  } else if (action === 'set') {
    const session = sessions.get(tabId);
    if (session?.gain) session.gain.gain.value = volume / 100;
  }
  return status(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.receiver !== 'offscreen' || sender.url !== chrome.runtime.getURL('worker.js')) return;
  handle(message).then(respond, error => respond({ error: error.message }));
  return true;
});

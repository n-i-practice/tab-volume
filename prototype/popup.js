const slider = document.getElementById('volume');
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let request = 0;

async function send(action, volume) {
  const result = await chrome.runtime.sendMessage({
    receiver: 'worker', action, tabId: tab.id, volume
  });
  if (result.error) throw new Error(result.error);
  return result;
}

function showVolume(volume) {
  slider.value = volume;
  slider.setAttribute('aria-valuetext', volume + '%');
  slider.title = volume + '%';
}

try {
  showVolume((await send('status')).volume);
  slider.disabled = false;
} catch (error) {
  slider.title = error.message;
  console.error(error);
}

slider.addEventListener('input', async () => {
  const currentRequest = ++request;
  const volume = Number(slider.value);
  showVolume(volume);
  try {
    await send('set', volume);
  } catch (error) {
    console.error(error);
    if (currentRequest !== request) return;
    try {
      const state = await send('status');
      if (currentRequest !== request) return;
      showVolume(state.volume);
      slider.title = error.message;
    } catch (statusError) {
      console.error(statusError);
    }
  }
});

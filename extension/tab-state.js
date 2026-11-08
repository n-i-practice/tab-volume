export const defaultState = Object.freeze({ active: false, volume: 100, muted: false });

export function validVolume(volume) {
  return Number.isInteger(volume) && volume >= 0 && volume <= 500 && volume % 10 === 0;
}

export function pageUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  const webStore = url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/.test(url.pathname));
  return (url.protocol === 'http:' || url.protocol === 'https:') && !webStore ? url : null;
}

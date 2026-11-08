export function message(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

const language = message('page_language');
const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });

export function formatVolume(volume) {
  return percent.format(volume / 100);
}

export function localizePage() {
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = message(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    element.setAttribute('aria-label', message(element.dataset.i18nLabel));
  }
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    element.title = message(element.dataset.i18nTitle);
  }
}

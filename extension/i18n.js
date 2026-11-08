export const languageKey = 'display:language';

const catalogs = new Map();
let catalog;
let language = chrome.i18n.getMessage('page_language');
let percent = volumeFormatter(language);
let languageRequest = 0;

export function message(key, substitutions) {
  const entry = catalog?.[key];
  if (!entry) return chrome.i18n.getMessage(key, substitutions);
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return entry.message.replace(/\$([a-z_]+)\$/gi, (token, name) => {
    const content = entry.placeholders?.[name.toLowerCase()]?.content;
    return content?.replace(/\$(\d+)/g, (_, index) => values[index - 1] ?? '') ?? token;
  });
}

function volumeFormatter(locale) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
}

export async function selectLanguage(preference) {
  const request = ++languageRequest;
  if (preference !== 'ja' && preference !== 'en') {
    catalog = undefined;
    language = chrome.i18n.getMessage('page_language');
    percent = volumeFormatter(language);
    return 'auto';
  }
  if (!catalogs.has(preference)) {
    const response = await fetch(chrome.runtime.getURL('_locales/' + preference + '/messages.json'));
    if (!response.ok) throw new Error('Could not load locale: ' + preference);
    catalogs.set(preference, await response.json());
  }
  if (request !== languageRequest) return null;
  catalog = catalogs.get(preference);
  language = preference;
  percent = volumeFormatter(language);
  return preference;
}

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

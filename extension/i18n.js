export const languageKey = 'display:language';

const supportedLanguages = ['ja', 'en', 'hi', 'zh_CN'];
const catalogs = new Map();
const browserLanguage = chrome.i18n.getMessage('page_language') || 'en';
const browserPreference = browserLanguage.replace('-', '_');
let catalog;
let language = browserLanguage;
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

export function resolveLanguage(preference) {
  if (supportedLanguages.includes(preference)) return preference;
  return supportedLanguages.includes(browserPreference) ? browserPreference : 'en';
}

export async function selectLanguage(preference) {
  const request = ++languageRequest;
  const selected = resolveLanguage(preference);
  if (selected === browserPreference) {
    catalog = undefined;
    language = browserLanguage;
    percent = volumeFormatter(language);
    return selected;
  }
  if (!catalogs.has(selected)) {
    const response = await fetch(chrome.runtime.getURL('_locales/' + selected + '/messages.json'));
    if (!response.ok) throw new Error('Could not load locale: ' + selected);
    catalogs.set(selected, await response.json());
  }
  if (request !== languageRequest) return null;
  catalog = catalogs.get(selected);
  language = catalog.page_language.message;
  percent = volumeFormatter(language);
  return selected;
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

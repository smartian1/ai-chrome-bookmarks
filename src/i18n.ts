export function uiLocale(): string {
  return typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : 'en';
}

export function isZh(): boolean {
  return /^zh/i.test(uiLocale());
}

export function t(key: string, subs?: string | number | Array<string | number>): string {
  const args = subs === undefined ? undefined : Array.isArray(subs) ? subs.map(String) : String(subs);
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const value = chrome.i18n.getMessage(key, args);
    if (value) return value;
  }
  return key;
}

export function listSeparator(): string {
  return isZh() ? '、' : ', ';
}

export function formatSource(source: string): string {
  if (source === '网页摘录' || source === 'Page excerpt' || source === 'excerpt') return t('sourceExcerpt');
  if (source === '模型推断' || source === 'AI inferred' || source === 'inferred') return t('sourceInferred');
  return source;
}

export function applyDocumentI18n(): void {
  document.documentElement.lang = isZh() ? 'zh-CN' : 'en';
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  }
  for (const node of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = node.dataset.i18nPlaceholder;
    if (key) node.placeholder = t(key);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = node.dataset.i18nAriaLabel;
    if (key) node.setAttribute('aria-label', t(key));
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = node.dataset.i18nTitle;
    if (key) node.title = t(key);
  }
}

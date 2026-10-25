import common from './en/common';
import templates from './en/templates';
import roster from './en/roster';
import readiness from './en/readiness';
import validation from './en/validation';

export type TranslationParams = Record<string, string | number>;
export type TranslationResources = Record<string, Record<string, string>>;
export type Translator = (key: string, params?: TranslationParams) => string;

// Explicit imports keep every shipped string available offline and in the HTML preview.
export const resources: TranslationResources = {
  en: { ...common, ...templates, ...roster, ...readiness, ...validation },
};
export const defaultLocale = 'en';
export const supportedLocales = ['en'] as const;

/** Missing locale/key: fall back to English. Missing parameters remain visible as {name}.
 * Unknown keys are visible diagnostics, never an empty label or an undefined value.
 * Only display strings belong here; persisted statuses, IDs and export columns stay canonical.
 */
export function createTranslator(
  dictionaries: TranslationResources,
  locale = defaultLocale,
  fallbackLocale = defaultLocale,
): Translator {
  return (key, params = {}) => {
    const candidates = [locale, locale.split('-')[0], fallbackLocale];
    let message: string | undefined;
    for (const candidate of candidates) {
      const dictionary = Object.hasOwn(dictionaries, candidate)
        ? dictionaries[candidate]
        : undefined;
      if (dictionary && Object.hasOwn(dictionary, key)) {
        message = dictionary[key];
        break;
      }
    }
    return (message ?? `[${key}]`).replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : placeholder,
    );
  };
}

export const t = createTranslator(resources);

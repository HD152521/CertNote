import type { Language } from '../i18n';

/**
 * A screen-scoped translation dictionary.
 *
 * `COMMON_STRINGS` in `../i18n` holds text shared across screens (save, cancel,
 * loading). Anything used by a single surface lives in its own module under this
 * directory instead — one 1,800-line dictionary would be unreadable, and every
 * screen would contend for the same file on edit.
 *
 * Both language maps are keyed identically, so a key added to `ko` without an `en`
 * counterpart is a type error rather than a Korean string leaking into English UI.
 */
export type Dict<K extends string> = Record<Language, Record<K, string>>;

/** Narrow a dictionary to one language: `const s = pick(pricingStrings, lang)`. */
export function pick<K extends string>(dict: Dict<K>, lang: Language): Record<K, string> {
  return dict[lang];
}

/**
 * Substitute `{name}` placeholders in a translated template.
 *
 * Counts and names must be interpolated, never concatenated onto a translated
 * fragment — `'남은 ' + n + '일'` has no correct English equivalent, whereas
 * `'{n} days left'` and `'{n}일 남음'` are both natural.
 */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

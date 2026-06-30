import i18n from './i18n'

// Locale-aware date helpers. Day/month names come straight from the browser's
// Intl data for the active UI language — so every shipped (and future) language
// gets correct names with no translation files. Components that render these
// already subscribe to i18n via useTranslation (or tick on a timer), so they
// re-render and re-read the active language on change.

// BCP-47 locale for the active UI language (our codes are already valid tags:
// en, es, fr, de, pt-BR, it, ru, zh-CN, ja).
export function dateLocale(): string {
  return i18n.language || 'en'
}

// Cache generated name arrays per (locale, kind) — building an Intl formatter
// and formatting 12/7 dates on every render would be wasteful.
const cache = new Map<string, string[]>()
function memo(kind: string, build: () => string[]): string[] {
  const key = `${dateLocale()}:${kind}`
  let v = cache.get(key)
  if (!v) {
    v = build()
    cache.set(key, v)
  }
  return v
}

// Month names in the active language. Index 0 = January … 11 = December.
export function months(format: 'long' | 'short' = 'long'): string[] {
  return memo(`m-${format}`, () => {
    const fmt = new Intl.DateTimeFormat(dateLocale(), { month: format })
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2021, m, 1)))
  })
}

// Weekday names in the active language. Index 0 = Sunday … 6 = Saturday, to
// match Date.getDay(). (2021-08-01 was a Sunday.)
export function weekdays(
  format: 'long' | 'short' | 'narrow' = 'short',
): string[] {
  return memo(`w-${format}`, () => {
    const fmt = new Intl.DateTimeFormat(dateLocale(), { weekday: format })
    return Array.from({ length: 7 }, (_, d) =>
      fmt.format(new Date(2021, 7, 1 + d)),
    )
  })
}

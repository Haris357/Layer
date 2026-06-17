import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import ptBR from '../locales/pt-BR.json'
import it from '../locales/it.json'
import ru from '../locales/ru.json'
import zhCN from '../locales/zh-CN.json'
import ja from '../locales/ja.json'

// Add a language: drop a `<code>.json` next to en.json (same key shape), import
// it above, register it in `resources`, and add an entry here. Once Layer is
// open-source these become community pull requests. Labels are in the language's
// own script so users find their own.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja', label: '日本語' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

// Right-to-left scripts — set <html dir> so layout mirrors. None shipped yet,
// but the moment an ar/he/fa/ur translation lands it lays out correctly.
const RTL = new Set(['ar', 'he', 'fa', 'ur'])

export function applyDir(lang: string) {
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

// Read the saved language straight from the persisted settings blob BEFORE
// React mounts, so the very first paint is already in the right language (the
// zustand store hydrates from the same key).
function initialLang(): LanguageCode {
  try {
    const raw = localStorage.getItem('layer-settings')
    const saved = raw ? JSON.parse(raw)?.state?.language : null
    if (LANGUAGES.some((l) => l.code === saved)) return saved
  } catch {
    /* malformed storage — fall back to English */
  }
  return 'en'
}

const lng = initialLang()

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    'pt-BR': { translation: ptBR },
    it: { translation: it },
    ru: { translation: ru },
    'zh-CN': { translation: zhCN },
    ja: { translation: ja },
  },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

applyDir(lng)

// Switch language at runtime and keep <html dir/lang> in sync.
export function changeLanguage(lang: LanguageCode) {
  i18n.changeLanguage(lang)
  applyDir(lang)
}

export default i18n

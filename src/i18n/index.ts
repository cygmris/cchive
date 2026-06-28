/**
 * i18next setup.
 *
 * Five bundled locales — English (the source of truth) plus Simplified Chinese,
 * Traditional Chinese, Japanese, and French. `en` is authoritative: any key
 * missing from another locale falls back to `en`.
 *
 * The initial language is detected from the persisted `clavis.language`
 * localStorage value (written by `lib/prefs`), then the browser, defaulting to
 * `en`. Under Tauri the authoritative pref lives in the store, so `main.tsx`
 * reapplies it via `setLanguage`/`i18n.changeLanguage` before first paint.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { LANGUAGE_LS_KEY, setLanguagePref } from "@/lib/prefs";
import en from "./locales/en.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";
import ja from "./locales/ja.json";
import fr from "./locales/fr.json";

/** The languages Clavis ships translations for (en is the baseline). */
export const SUPPORTED_LANGUAGES = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "fr",
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Static resource bundles, one `translation` namespace per locale. */
export const resources = {
  en: { translation: en },
  "zh-Hans": { translation: zhHans },
  "zh-Hant": { translation: zhHant },
  ja: { translation: ja },
  fr: { translation: fr },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // Use the exact tag (e.g. "zh-Hans") rather than stripping to "zh".
    load: "currentOnly",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_LS_KEY,
      // Persistence is owned by lib/prefs (so it also reaches the Tauri store).
      caches: [],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

/**
 * Switch the active language and persist it. Calls `i18n.changeLanguage` (which
 * re-renders any `useTranslation` consumer) then writes the `language` pref.
 * Never throws — persistence failures degrade silently.
 */
export async function setLanguage(lng: Language): Promise<void> {
  await i18n.changeLanguage(lng);
  await setLanguagePref(lng);
}

export default i18n;

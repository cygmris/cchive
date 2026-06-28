/**
 * i18n behaviour tests — the public contract of {@link setLanguage} and the
 * fallback chain.
 *
 * `setLanguage("fr")` flips the active language so a translated value changes
 * (English → French), and a key present only in the `en` baseline still resolves
 * under another locale because `en` is the fallback. Runs against the real
 * i18next singleton (locales bundled at import); persistence degrades to
 * localStorage under jsdom, so nothing is mocked.
 */
import { describe, expect, it } from "vitest";
import i18n, { setLanguage } from "./index";

describe("setLanguage", () => {
  it("switches the active language so a translated value changes", async () => {
    await setLanguage("en");
    expect(i18n.t("settings.title")).toBe("Settings");

    await setLanguage("fr");
    expect(i18n.t("settings.title")).toBe("Paramètres");

    // Restore so test order can't leak the French state.
    await setLanguage("en");
  });
});

describe("fallback to en", () => {
  it("resolves a key missing from the active locale via the en baseline", async () => {
    // Add a key to the en baseline only; no other locale carries it.
    i18n.addResource("en", "translation", "test.enOnly", "Fallback Value");

    await setLanguage("fr");
    // fr has no `test.enOnly`, so i18next falls back to en's value.
    expect(i18n.t("test.enOnly")).toBe("Fallback Value");

    await setLanguage("en");
  });
});

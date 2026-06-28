import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Initialize i18next before the app so the first render already has its strings.
import i18n from "@/i18n";
import App from "@/App";
import { getLanguagePref } from "@/lib/prefs";
import "@/styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");
const root = createRoot(container);

function render(): void {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Apply the persisted language (authoritative under Tauri, where it lives in the
// store) before the first paint, then render. Any failure is non-fatal — i18n is
// already initialized with the detected/fallback language.
void getLanguagePref()
  .then((lng) => (lng && lng !== i18n.language ? i18n.changeLanguage(lng) : undefined))
  .catch(() => undefined)
  .finally(render);

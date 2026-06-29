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

// Paint immediately: i18n is already initialized with the detected/fallback
// language, so the first frame is correct for most users and never blank.
render();

// Then apply the persisted language (authoritative under Tauri, where it lives
// in the store) — i18n re-renders in place after first paint. Fire-and-forget:
// any failure is non-fatal and the detected/fallback language stands.
void getLanguagePref()
  .then((lng) => (lng && lng !== i18n.language ? i18n.changeLanguage(lng) : undefined))
  .catch(() => undefined);

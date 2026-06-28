/**
 * Application root + dev hash router.
 *
 * S1 stands up the design-system foundation (tokens, fonts, theme engine,
 * component library). The real application shell — window chrome, sidebar,
 * the 13 screens — is composed in later specs. For now this renders a small
 * token-driven splash so the Tauri window is never blank.
 *
 * `#/gallery` opens the developer-only component gallery for visual fidelity
 * checks. It is intentionally NOT part of the user navigation — there is no
 * link to it; you reach it only by typing the hash.
 */
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Gallery } from "@/screens/_gallery/Gallery";

/** Track the current location hash so `#/gallery` toggles without a reload. */
function useHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Splash() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--app-bg)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--fs-title)",
            lineHeight: "var(--lh-title)",
            letterSpacing: "var(--ls-title)",
            fontWeight: 600,
          }}
        >
          Clavis
        </h1>
        <p
          style={{
            marginTop: "var(--space-2)",
            color: "var(--text-2)",
            fontSize: "var(--fs-body)",
          }}
        >
          Design system foundation
        </p>
      </div>
    </main>
  );
}

export default function App() {
  const hash = useHash();
  const showGallery = hash === "#/gallery";

  return (
    <ThemeProvider>{showGallery ? <Gallery /> : <Splash />}</ThemeProvider>
  );
}

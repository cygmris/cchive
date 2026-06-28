/**
 * ScreenHeader — the shared sticky screen header.
 *
 * The title + one-line description pattern that caps every screen, sticking to
 * the top of the scrolling content area (`--app-bg` so rows scroll under it).
 * Sentence case throughout (only eyebrows are uppercase, and there are none
 * here). An optional back link sits above the title — the Config Editor uses it
 * to return to Configurations. This is the reusable header every screen mounts.
 */
import { ChevronLeft } from "@/ui/icons";

export interface ScreenHeaderProps {
  /** Screen title (e.g. "Overview"). */
  title: string;
  /** One-line description shown beneath the title. */
  description?: string;
  /** Label for a back link rendered above the title (e.g. "Configurations"). */
  backLabel?: string;
  /** Invoked when the back link is clicked. */
  onBack?: () => void;
}

/** Sticky title + one-liner header, reused by every screen. */
export function ScreenHeader({
  title,
  description,
  backLabel,
  onBack,
}: ScreenHeaderProps) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--app-bg)",
        padding: "var(--space-6) var(--gutter) var(--space-3_5)",
      }}
    >
      {backLabel != null && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            height: 22,
            marginBottom: "var(--space-0_5)",
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-2)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            fontWeight: "var(--weight-medium)",
            cursor: "pointer",
            width: "max-content",
          }}
        >
          <ChevronLeft size={14} />
          {backLabel}
        </button>
      )}
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-title)",
          fontWeight: "var(--weight-semibold)",
          letterSpacing: "var(--ls-title)",
          color: "var(--text)",
        }}
      >
        {title}
      </div>
      {description != null && (
        <div
          style={{
            marginTop: 3,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body)",
            fontWeight: "var(--weight-regular)",
            color: "var(--text-2)",
          }}
        >
          {description}
        </div>
      )}
    </header>
  );
}

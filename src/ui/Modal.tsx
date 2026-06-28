/**
 * Modal — a centered dialog over a `--backdrop` scrim (OAuth card, command
 * palette host). Built on `@floating-ui/react`: closes on Esc and
 * backdrop-press, traps focus while open and returns it on close, and locks
 * body scroll via `FloatingOverlay`. Two sizes: `sm` (~380px OAuth card) and
 * `md` (~540px palette panel). Token-only styling.
 */
import { useId } from "react";
import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";
import { cn } from "@/lib/cn";
import { X } from "@/ui/icons";

export type ModalSize = "sm" | "md";

export interface ModalProps {
  /** Whether the modal is shown. */
  open: boolean;
  /** Called when the modal requests to close (Esc, backdrop, close button). */
  onClose: () => void;
  /** Optional heading; wires `aria-labelledby` when present. */
  title?: React.ReactNode;
  /** Dialog body. */
  children: React.ReactNode;
  /** Optional footer (actions). Pinned below the scrollable body. */
  footer?: React.ReactNode;
  /** Card width. `sm` ≈ 380px, `md` ≈ 540px. @default "sm" */
  size?: ModalSize;
  /** Show the top-right close button. @default true */
  showClose?: boolean;
  /** Extra class for the dialog card. */
  className?: string;
}

const WIDTH: Record<ModalSize, number> = { sm: 380, md: 540 };

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "sm",
  showClose = true,
  className,
}: ModalProps) {
  const { refs, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });

  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const { isMounted, styles } = useTransitionStyles(context, {
    duration: 150,
    initial: { opacity: 0, transform: "scale(0.96)" },
  });

  const headingId = useId();
  const hasHeader = title != null || showClose;

  if (!isMounted) return null;

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        style={{
          display: "grid",
          placeItems: "center",
          padding: 24,
          zIndex: 100,
          background: "color-mix(in srgb, var(--backdrop) 75%, transparent)",
          opacity: typeof styles.opacity === "number" ? styles.opacity : 1,
        }}
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            aria-labelledby={title != null ? headingId : undefined}
            className={cn(className)}
            {...getFloatingProps()}
            style={{
              ...styles,
              display: "flex",
              flexDirection: "column",
              width: WIDTH[size],
              maxWidth: "100%",
              maxHeight: "calc(100vh - 48px)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-3xl)",
              boxShadow: "var(--shadow-pop)",
              color: "var(--text)",
              overflow: "hidden",
            }}
          >
            {hasHeader && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "16px 18px 10px",
                }}
              >
                {title != null ? (
                  <h2
                    id={headingId}
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--fs-heading)",
                      lineHeight: "var(--lh-heading)",
                      letterSpacing: "var(--ls-heading)",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {title}
                  </h2>
                ) : (
                  <span />
                )}
                {showClose && (
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      marginRight: -4,
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-3)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>
            )}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: hasHeader ? "0 18px 18px" : "18px",
                fontSize: "var(--fs-body)",
                lineHeight: "var(--lh-body)",
                color: "var(--text-2)",
              }}
            >
              {children}
            </div>
            {footer && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  padding: "12px 18px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {footer}
              </div>
            )}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

/**
 * Tooltip — a small, delayed hover/focus label. Built on `@floating-ui/react`
 * so it auto-positions (flips + shifts to stay on-screen) and exposes proper
 * `role="tooltip"` / `aria-describedby` wiring. Pass `mono` to render token
 * values (keys, model ids) in Geist Mono. Styling is token-only, so the chip
 * follows the active theme.
 */
import { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
  type Placement,
} from "@floating-ui/react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  /** The label content. When empty, the anchor renders without a tooltip. */
  label: React.ReactNode;
  /** The anchor element the tooltip describes. */
  children: React.ReactNode;
  /** Preferred placement. @default "top" */
  placement?: Placement;
  /** Render the label in `--font-mono`. */
  mono?: boolean;
  /** Open delay in ms. @default 400 */
  delay?: number;
  /** Disable the tooltip (anchor still renders). */
  disabled?: boolean;
  /** Extra class for the tooltip chip. */
  className?: string;
}

export function Tooltip({
  label,
  children,
  placement = "top",
  mono = false,
  delay = 400,
  disabled = false,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 6 }), shift({ padding: 6 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    enabled: !disabled,
    move: false,
    delay: { open: delay, close: 80 },
  });
  const focus = useFocus(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const { isMounted, styles } = useTransitionStyles(context, {
    duration: 120,
    initial: { opacity: 0, transform: "scale(0.97)" },
  });

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        style={{ display: "inline-flex" }}
      >
        {children}
      </span>
      {label != null && label !== "" && isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 70, pointerEvents: "none" }}
            {...getFloatingProps()}
          >
            <div
              className={cn(className)}
              style={{
                ...styles,
                maxWidth: 240,
                padding: "4px 8px",
                background: "var(--text)",
                color: "var(--surface)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-raised)",
                fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
                fontSize: mono ? "var(--fs-mono-sm)" : "var(--fs-body-sm)",
                fontWeight: 500,
                lineHeight: 1.4,
                whiteSpace: mono ? "nowrap" : "normal",
              }}
            >
              {label}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

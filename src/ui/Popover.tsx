/**
 * Popover — an anchored floating panel (account switcher, new-provider menu,
 * chart legends). Built on `@floating-ui/react`: it opens up or down depending
 * on room (`flip`), closes on outside-press and Esc, and manages focus while
 * open. Lifts off the surface with `--shadow-pop` at radius xl (12px).
 *
 * Controlled (`open` + `onOpenChange`) or uncontrolled. `children` may be a
 * render function receiving `{ close }` so menu items can dismiss the panel.
 */
import { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  useTransitionStyles,
  type Placement,
} from "@floating-ui/react";
import { cn } from "@/lib/cn";

export interface PopoverProps {
  /** The element that toggles the panel. */
  trigger: React.ReactNode;
  /** Panel content, or a render fn given `{ close }`. */
  children: React.ReactNode | ((args: { close: () => void }) => React.ReactNode);
  /** Controlled open state. */
  open?: boolean;
  /** Controlled open-change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Preferred placement. @default "bottom-start" */
  placement?: Placement;
  /** Distance from the trigger in px. @default 6 */
  offsetPx?: number;
  /** Trap focus inside the panel while open. @default false */
  modal?: boolean;
  /** Extra class for the panel. */
  className?: string;
  /** Inline style override for the panel. */
  style?: React.CSSProperties;
}

export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  placement = "bottom-start",
  offsetPx = 6,
  modal = false,
  className,
  style,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(offsetPx), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  const { isMounted, styles } = useTransitionStyles(context, {
    duration: 130,
    initial: { opacity: 0, transform: "scale(0.97)" },
  });

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        style={{ display: "inline-flex" }}
      >
        {trigger}
      </span>
      {isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={modal}>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, zIndex: 60 }}
              {...getFloatingProps()}
            >
              <div
                className={cn(className)}
                style={{
                  ...styles,
                  minWidth: 180,
                  padding: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xl)",
                  boxShadow: "var(--shadow-pop)",
                  color: "var(--text)",
                  fontSize: "var(--fs-body)",
                  ...style,
                }}
              >
                {typeof children === "function"
                  ? children({ close: () => setOpen(false) })
                  : children}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

/**
 * Toast — transient notifications. Wrap the app (or a screen) in
 * `<ToastProvider>` and call `useToast().toast(...)` to push a message. Toasts
 * stack bottom-right, carry a semantic variant (success / warning / danger /
 * info / neutral), and auto-dismiss after `duration` ms (set `duration: 0` to
 * keep it until dismissed). Token-only styling, accessible live region.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Danger, Info, Success, Warning, X, type IconComponent } from "@/ui/icons";

export type ToastVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface ToastOptions {
  /** Bold first line. */
  title?: string;
  /** Secondary line / detail. */
  description?: React.ReactNode;
  /** Semantic color + icon. @default "neutral" */
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms; `0` persists until dismissed. @default 4000 */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

export interface ToastContextValue {
  /** Push a toast; accepts a message string or full options. Returns its id. */
  toast: (input: ToastOptions | string) => string;
  /** Dismiss a toast by id. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast API. Must be used under a `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

const VARIANT: Record<
  ToastVariant,
  { color: string; Icon: IconComponent | null }
> = {
  neutral: { color: "var(--text-2)", Icon: null },
  success: { color: "var(--success)", Icon: Success },
  warning: { color: "var(--warning)", Icon: Warning },
  danger: { color: "var(--danger)", Icon: Danger },
  info: { color: "var(--info)", Icon: Info },
};

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastOptions | string) => {
    const opts = typeof input === "string" ? { description: input } : input;
    const id = `toast-${++seq}`;
    setItems((prev) => [
      ...prev,
      { variant: "neutral", duration: 4000, ...opts, id },
    ]);
    return id;
  }, []);

  const api = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [
    toast,
    dismiss,
  ]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: "calc(100vw - 40px)",
          pointerEvents: "none",
        }}
      >
        <style>
          {"@keyframes cchive-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"}
        </style>
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const { id, title, description, variant = "neutral", duration = 4000 } = item;
  const { color, Icon } = VARIANT[variant];

  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role={variant === "danger" || variant === "warning" ? "alert" : "status"}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        minWidth: 260,
        maxWidth: 380,
        padding: "11px 12px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-pop)",
        color: "var(--text)",
        animation: "cchive-toast-in 160ms ease-out",
      }}
    >
      {Icon && (
        <Icon
          size={16}
          aria-hidden
          style={{ color, flexShrink: 0, marginTop: 1 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              fontWeight: 600,
              lineHeight: 1.35,
              color: "var(--text)",
            }}
          >
            {title}
          </div>
        )}
        {description != null && (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              lineHeight: "var(--lh-body-sm)",
              color: "var(--text-2)",
              marginTop: title ? 2 : 0,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(id)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 20,
          height: 20,
          padding: 0,
          border: "none",
          background: "transparent",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-3)",
          cursor: "pointer",
        }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

/**
 * SegmentedControl — a single-select control rendered as a row of 2+ segments
 * inside a `--surface-2` well, with an animated `--surface` pill that slides
 * under the active segment (~0.18s ease). Used for light/dark, 30d/7d usage
 * range, and view-mode toggles.
 *
 * Controlled and generic over the value type. Implements the WAI-ARIA radio
 * group pattern: `role="radiogroup"` with `role="radio"` segments, roving
 * tabindex, and Arrow/Home/End keyboard navigation (which also selects). Icon-
 * only segments (e.g. sun/moon) should pass `aria-label`.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type SegmentedSize = "sm" | "md";

export interface SegmentOption<T extends string> {
  /** The value this segment selects. */
  value: T;
  /** Text label (omit for an icon-only segment). */
  label?: ReactNode;
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Accessible name — required for icon-only segments. */
  "aria-label"?: string;
}

export interface SegmentedControlProps<T extends string> {
  /** The segments, in order (2 or more). */
  options: SegmentOption<T>[];
  /** Currently-selected value. */
  value: T;
  /** Called with the next value when a segment is selected. */
  onChange: (value: T) => void;
  /** Segment height/typography. @default "md" */
  size?: SegmentedSize;
  /** Disable the whole control. @default false */
  disabled?: boolean;
  /** Accessible name for the group. */
  "aria-label"?: string;
  className?: string;
}

interface PillRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const CONTAINER_SIZE: Record<SegmentedSize, string> = {
  md: "p-[3px]",
  sm: "p-[2px]",
};

const SEGMENT_SIZE: Record<SegmentedSize, string> = {
  md: "h-7 px-3 text-[12.5px]",
  sm: "h-6 px-[10px] text-[11.5px]",
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pill, setPill] = useState<PillRect | null>(null);
  const [animate, setAnimate] = useState(false);

  const foundIndex = options.findIndex((o) => o.value === value);
  const activeIndex = foundIndex === -1 ? 0 : foundIndex;

  // Measure the active segment so the pill can sit (and slide) under it.
  useLayoutEffect(() => {
    const el = btnRefs.current[activeIndex];
    if (!el) return;
    setPill({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }, [activeIndex, options, size]);

  // Re-measure on container resize (font load, layout reflow, …).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const el = btnRefs.current[activeIndex];
      if (!el) return;
      setPill({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeIndex]);

  // Enable the slide transition only after the first paint, so the pill doesn't
  // animate in from the corner on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function select(index: number) {
    const next = options[index];
    if (next) onChange(next.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (activeIndex + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (activeIndex - 1 + options.length) % options.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(nextIndex);
    btnRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex items-center gap-[2px] rounded-md border border-border bg-surface-2",
        CONTAINER_SIZE[size],
        disabled && "opacity-50",
        className,
      )}
    >
      {pill && (
        <span
          aria-hidden
          style={{
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
          }}
          className={cn(
            "pointer-events-none absolute z-0 rounded-sm bg-surface shadow-[var(--shadow-card)]",
            animate
              ? "transition-[left,top,width,height] duration-[180ms] ease-out"
              : "transition-none",
          )}
        />
      )}

      {options.map((option, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={option.value}
            ref={(el) => {
              btnRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option["aria-label"]}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => select(index)}
            className={cn(
              "relative z-[1] inline-flex items-center justify-center gap-[6px]",
              "rounded-sm border-none bg-transparent font-sans font-medium outline-none",
              "cursor-pointer transition-colors duration-150 ease-out",
              "focus-visible:shadow-[var(--ring-accent)]",
              "disabled:cursor-not-allowed",
              active ? "text-text" : "text-text-3 hover:text-text-2",
              SEGMENT_SIZE[size],
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

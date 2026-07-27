import { useRef } from "react";
import { cn } from "@/lib/utils";

export type RangeOption<T extends string> = {
  value: T;
  label: string;
};

/**
 * Compact segmented control for dashboard range/period toggles (AIX-604).
 * Radiogroup (not Tabs) — selection filters data elsewhere; there is no tab panel.
 * Active option uses the same muted-track / background-pill contrast as TabsList.
 */
export function RangeSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel = "Time range",
}: {
  value: T;
  options: readonly RangeOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectByOffset = (from: T, delta: number) => {
    const idx = options.findIndex((opt) => opt.value === from);
    if (idx < 0 || options.length === 0) return;
    const nextIdx = (idx + delta + options.length) % options.length;
    onChange(options[nextIdx].value);
    // Move DOM focus to the newly selected button (roving tabindex requires this).
    buttonRefs.current[nextIdx]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground",
        className
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            data-state={selected ? "active" : "inactive"}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "relative inline-flex h-6 items-center justify-center rounded-md border border-transparent px-2.5 text-xs whitespace-nowrap transition-all",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1",
              selected
                ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            )}
            onClick={() => onChange(opt.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                selectByOffset(opt.value, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                selectByOffset(opt.value, -1);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

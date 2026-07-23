import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RangeOption<T extends string> = {
  value: T;
  label: string;
};

/**
 * Compact segmented control for dashboard range/period toggles (AIX-604).
 * Uses Tabs active styling so the selected option is clearly highlighted —
 * Button secondary/ghost was too low-contrast against card backgrounds.
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
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={cn("gap-0", className)}
    >
      <TabsList className="h-7" aria-label={ariaLabel}>
        {options.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className="h-6 px-2.5 text-xs"
          >
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

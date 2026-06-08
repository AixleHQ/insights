import { Search, X, Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, humanizeToolName } from "@/lib/utils";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";
import {
  EVENT_CATEGORY_LABEL,
  type EventCategory,
} from "@/lib/eventTypes";
import type { ProjectWithStats } from "@/lib/types";

export interface EventFiltersState {
  search?: string;
  /** Canonical API `tool_name` (e.g. `cursor`, `claude_code`). */
  tool?: string;
  riskLevels?: string[];
  /** UI category key (prompt, completion, …), expanded to DB types before API calls. */
  eventType?: EventCategory;
  dateFrom?: string;
  dateTo?: string;
  /** API `project_id` (organization project UUID). */
  projectId?: string;
}

interface EventFiltersProps {
  filters: EventFiltersState;
  onFiltersChange: (filters: EventFiltersState) => void;
  tools: readonly EventsToolFilterOption[];
  /** When provided, shows a project filter wired to `project_id` on the API. */
  projects?: ProjectWithStats[];
  className?: string;
}

const riskLevels = [
  { value: "critical", label: "Critical", color: "bg-risk-critical" },
  { value: "high", label: "High", color: "bg-risk-high" },
  { value: "medium", label: "Medium", color: "bg-risk-medium" },
  { value: "low", label: "Low", color: "bg-risk-low" },
  { value: "none", label: "None", color: "bg-muted-foreground" },
];

const eventTypeOptions = (
  Object.entries(EVENT_CATEGORY_LABEL) as [EventCategory, string][]
).map(([value, label]) => ({ value, label }));

export function FilterChip({
  label,
  value,
  onRemove,
  colorDot,
}: {
  label: string;
  value: string;
  onRemove: () => void;
  colorDot?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
      {colorDot && (
        <span className={cn("size-2 rounded-full", colorDot)} />
      )}
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function DateRangePicker({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: (value: string | undefined) => void;
  onDateToChange: (value: string | undefined) => void;
}) {
  const hasDateFilter = dateFrom || dateTo;

  const formatDateDisplay = () => {
    if (dateFrom && dateTo) {
      return `${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    if (dateFrom) {
      return `From ${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    if (dateTo) {
      return `Until ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    return "Date range";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-2 border-dashed font-normal",
            hasDateFilter && "border-solid border-primary/50 bg-primary/5"
          )}
        >
          <Calendar className="size-3.5 text-muted-foreground" />
          <span className={hasDateFilter ? "text-foreground" : "text-muted-foreground"}>
            {formatDateDisplay()}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium">Date Range</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">From</label>
              <Input
                type="date"
                value={dateFrom || ""}
                onChange={(e) => onDateFromChange(e.target.value || undefined)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="date"
                value={dateTo || ""}
                onChange={(e) => onDateToChange(e.target.value || undefined)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                onDateFromChange(undefined);
                onDateToChange(undefined);
              }}
            >
              Clear dates
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function EventFilters({
  filters,
  onFiltersChange,
  tools,
  projects,
  className,
}: EventFiltersProps) {
  const updateFilter = (key: keyof EventFiltersState, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === "" || value === "all" ? undefined : value,
    });
  };

  const updateRiskLevels = (values: string[] | undefined) => {
    onFiltersChange({ ...filters, riskLevels: values });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  // Collect active filter chips
  const activeFilters: { key: keyof EventFiltersState; label: string; value: string; colorDot?: string }[] = [];

  if (filters.tool) {
    const toolLabel =
      tools.find((t) => t.value === filters.tool)?.label ?? humanizeToolName(filters.tool);
    activeFilters.push({ key: "tool", label: "Tool", value: toolLabel });
  }
  // riskLevels chips are rendered separately below (per-level chips)
  if (filters.eventType) {
    const label = filters.eventType ? EVENT_CATEGORY_LABEL[filters.eventType] : undefined;
    activeFilters.push({ key: "eventType", label: "Type", value: label || filters.eventType });
  }
  if (filters.dateFrom) {
    activeFilters.push({
      key: "dateFrom",
      label: "From",
      value: new Date(filters.dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    });
  }
  if (filters.dateTo) {
    activeFilters.push({
      key: "dateTo",
      label: "To",
      value: new Date(filters.dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    });
  }
  if (filters.projectId && projects?.length) {
    const proj = projects.find((p) => p.id === filters.projectId);
    activeFilters.push({
      key: "projectId",
      label: "Project",
      value: proj?.name ?? filters.projectId,
    });
  }

  const hasActiveFilters = activeFilters.length > 0 || !!filters.search || (filters.riskLevels?.length ?? 0) > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={filters.search || ""}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="h-9 sm:h-8 pl-8 pr-8 text-sm"
          />
          {filters.search && (
            <button
              onClick={() => updateFilter("search", undefined)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="hidden sm:block h-5 w-px bg-border" />

        {/* Filter selects - grid on mobile, inline on desktop */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {/* Tool filter */}
          <Select
            value={filters.tool || "all"}
            onValueChange={(value) => updateFilter("tool", value)}
          >
            <SelectTrigger className={cn(
              "h-9 sm:h-8 w-full sm:w-[140px] gap-1 border-dashed text-sm font-normal",
              filters.tool && "border-solid border-primary/50 bg-primary/5"
            )}>
              <SelectValue placeholder="Tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tools</SelectItem>
              {tools.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Risk level multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 sm:h-8 w-full sm:w-[140px] justify-between gap-1 border-dashed text-sm font-normal",
                  (filters.riskLevels?.length ?? 0) > 0 &&
                    "border-solid border-primary/50 bg-primary/5"
                )}
              >
                <span
                  className={
                    (filters.riskLevels?.length ?? 0) > 0
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {(filters.riskLevels?.length ?? 0) > 0
                    ? `Risk (${filters.riskLevels!.length})`
                    : "Risk level"}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-2" align="start">
              <div className="space-y-0.5">
                {riskLevels.map((level) => (
                  <label
                    key={level.value}
                    htmlFor={`risk-${level.value}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      id={`risk-${level.value}`}
                      checked={(filters.riskLevels || []).includes(level.value)}
                      onCheckedChange={(checked) => {
                        const current = filters.riskLevels || [];
                        const next = checked === true
                          ? [...current, level.value]
                          : current.filter((v) => v !== level.value);
                        updateRiskLevels(next.length > 0 ? next : undefined);
                      }}
                    />
                    <span className={cn("size-2 flex-shrink-0 rounded-full", level.color)} />
                    {level.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Event type filter */}
          <Select
            value={filters.eventType || "all"}
            onValueChange={(value) => updateFilter("eventType", value)}
          >
            <SelectTrigger className={cn(
              "h-9 sm:h-8 w-full sm:w-[140px] gap-1 border-dashed text-sm font-normal",
              filters.eventType && "border-solid border-primary/50 bg-primary/5"
            )}>
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {eventTypeOptions.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Project filter (server-side project_id — matches export + list API) */}
          {projects && projects.length > 0 && (
            <Select
              value={filters.projectId || "all"}
              onValueChange={(value) => updateFilter("projectId", value)}
            >
              <SelectTrigger
                className={cn(
                  "h-9 sm:h-8 w-full min-w-[140px] sm:w-[180px] gap-1 border-dashed text-sm font-normal",
                  filters.projectId && "border-solid border-primary/50 bg-primary/5"
                )}
              >
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Date range picker */}
          <DateRangePicker
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onDateFromChange={(value) => updateFilter("dateFrom", value)}
            onDateToChange={(value) => updateFilter("dateTo", value)}
          />
        </div>

        {/* Clear all button */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 sm:contents">
            <div className="hidden sm:block h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 sm:h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 size-3" />
              Clear all
            </Button>
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {(activeFilters.length > 0 || (filters.riskLevels?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {activeFilters.map((filter) => (
            <FilterChip
              key={filter.key}
              label={filter.label}
              value={filter.value}
              colorDot={filter.colorDot}
              onRemove={() => updateFilter(filter.key, undefined)}
            />
          ))}
          {filters.riskLevels?.map((level) => {
            const risk = riskLevels.find((r) => r.value === level);
            return (
              <FilterChip
                key={`risk-${level}`}
                label="Risk"
                value={risk?.label ?? level}
                colorDot={risk?.color}
                onRemove={() => {
                  const next = (filters.riskLevels || []).filter((v) => v !== level);
                  updateRiskLevels(next.length > 0 ? next : undefined);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

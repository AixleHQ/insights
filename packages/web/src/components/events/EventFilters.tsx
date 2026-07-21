import { useState } from "react";
import { Search, X, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatLocalDate, organizationMemberUserId, getMemberDisplayName } from "@/lib/utils";
import { humanizeToolName } from "@/lib/utils";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";
import {
  EVENT_TYPES_BY_BAND,
  EVENT_TYPE_BAND_DOT_CLASS,
  EVENT_TYPE_BAND_LABEL,
  EVENT_TYPE_BAND_ORDER,
  EVENT_TYPE_META,
} from "@/lib/event-types";
import type { ProjectWithStats, EventType, OrganizationMember } from "@/lib/types";

export interface EventFiltersState {
  search?: string;
  /** Canonical tool names (e.g. `["cursor", "claude_code"]`). */
  tools?: string[];
  riskLevels?: string[];
  /** Raw DB event_type strings (14 types). */
  eventTypes?: EventType[];
  dateFrom?: string;
  dateTo?: string;
  /** Organization project UUIDs. */
  projectIds?: string[];
  /** Minimum correlation confidence (0–1). Only used in "Not Assigned" mode. */
  minConfidence?: number;
  /** Member user UUID — set via the User filter dropdown, or from a "View all" deep-link on a member's profile. */
  userId?: string;
  /** Display label for `userId`, shown on the filter chip. */
  userName?: string;
}

interface EventFiltersProps {
  filters: EventFiltersState;
  onFiltersChange: (filters: EventFiltersState) => void;
  tools: readonly EventsToolFilterOption[];
  /** When provided, shows a project sub-menu in the filter panel. */
  projects?: ProjectWithStats[];
  /** When provided (non-empty), shows a User sub-menu. Caller is responsible for admin/owner gating. */
  members?: OrganizationMember[];
  /** Node rendered to the left of the search bar (e.g. tab switcher). */
  leading?: React.ReactNode;
  /** When true, shows a Confidence sub-menu in the filter dropdown. */
  showConfidence?: boolean;
  /** When true, hides Risk level, Event type and Project filters. */
  hideAdvancedFilters?: boolean;
  /** Node rendered to the right of the Filters button (e.g. bulk-assign action). */
  trailing?: React.ReactNode;
  className?: string;
}

const riskLevelOptions = [
  { value: "critical", label: "Critical", color: "bg-risk-critical" },
  { value: "high", label: "High", color: "bg-risk-high" },
  { value: "medium", label: "Medium", color: "bg-risk-medium" },
  { value: "low", label: "Low", color: "bg-risk-low" },
  { value: "none", label: "None", color: "bg-muted-foreground" },
];


function toggleArray<T extends string>(
  current: T[] | undefined,
  value: T,
  checked: boolean
): T[] | undefined {
  const arr = current ?? [];
  const next = checked ? [...arr, value] : arr.filter((v) => v !== value);
  return next.length > 0 ? next : undefined;
}

const fmtDate = formatLocalDate;

function getDatePreset(preset: "today" | "yesterday" | "this_week" | "this_month") {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: fmtDate(now), to: fmtDate(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: fmtDate(y), to: fmtDate(y) };
    }
    case "this_week": {
      const start = new Date(now);
      const day = now.getDay();
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { from: fmtDate(start), to: fmtDate(now) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmtDate(start), to: fmtDate(now) };
    }
  }
}

export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

const confidenceOptions = [
  { value: 0.5, label: "≥ 50%" },
  { value: 0.7, label: "≥ 70%" },
  { value: 0.85, label: "≥ 85%" },
  { value: 0.9, label: "≥ 90%" },
];

export function EventFilters({
  filters,
  onFiltersChange,
  tools,
  projects,
  members,
  leading,
  trailing,
  showConfidence,
  hideAdvancedFilters,
  className,
}: EventFiltersProps) {
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const activeFilterCount = [
    filters.tools?.length,
    filters.riskLevels?.length,
    filters.eventTypes?.length,
    filters.projectIds?.length,
    (filters.dateFrom || filters.dateTo) ? 1 : 0,
    filters.minConfidence != null ? 1 : 0,
    filters.userId ? 1 : 0,
  ].filter(Boolean).length;

  const clearAll = () => onFiltersChange({});

  const openCustomDialog = () => {
    setCustomFrom(filters.dateFrom ?? "");
    setCustomTo(filters.dateTo ?? "");
    setCustomDateOpen(true);
  };

  const applyCustomDates = () => {
    if (customFrom && customTo && customFrom > customTo) return;
    onFiltersChange({
      ...filters,
      dateFrom: customFrom || undefined,
      dateTo: customTo || undefined,
    });
    setCustomDateOpen(false);
  };

  // Build one chip per active filter category
  const chips: {
    key: string;
    label: string;
    value: string;
    onRemove: () => void;
  }[] = [];

  if (filters.userId) {
    chips.push({
      key: "user",
      label: "User",
      value: filters.userName ?? filters.userId,
      onRemove: () => onFiltersChange({ ...filters, userId: undefined, userName: undefined }),
    });
  }

  if (filters.tools?.length) {
    const labels = filters.tools.map(
      (t) => tools.find((o) => o.value === t)?.label ?? humanizeToolName(t)
    );
    chips.push({
      key: "tools",
      label: "Tool",
      value: labels.join(", "),
      onRemove: () => onFiltersChange({ ...filters, tools: undefined }),
    });
  }

  if (filters.eventTypes?.length) {
    chips.push({
      key: "eventTypes",
      label: "Type",
      value: filters.eventTypes.map((t) => EVENT_TYPE_META[t].label).join(", "),
      onRemove: () => onFiltersChange({ ...filters, eventTypes: undefined }),
    });
  }

  if (filters.projectIds?.length) {
    const names = filters.projectIds.map(
      (id) => projects?.find((p) => p.id === id)?.name ?? (id === "none" ? "No Project" : id)
    );
    chips.push({
      key: "projects",
      label: "Project",
      value: names.join(", "),
      onRemove: () => onFiltersChange({ ...filters, projectIds: undefined }),
    });
  }

  if (filters.riskLevels?.length) {
    const labels = filters.riskLevels.map(
      (l) => l === "not_none" ? "Has Risk" : (riskLevelOptions.find((r) => r.value === l)?.label ?? l)
    );
    chips.push({
      key: "risk",
      label: "Risk",
      value: labels.join(", "),
      onRemove: () => onFiltersChange({ ...filters, riskLevels: undefined }),
    });
  }

  if (filters.minConfidence != null) {
    const label = confidenceOptions.find((o) => o.value === filters.minConfidence)?.label
      ?? `≥ ${Math.round(filters.minConfidence * 100)}%`;
    chips.push({
      key: "confidence",
      label: "Confidence",
      value: label,
      onRemove: () => onFiltersChange({ ...filters, minConfidence: undefined }),
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    const fmt = (d: string) =>
      new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const value =
      filters.dateFrom && filters.dateTo
        ? `${fmt(filters.dateFrom)} – ${fmt(filters.dateTo)}`
        : filters.dateFrom
          ? `From ${fmt(filters.dateFrom)}`
          : `Until ${fmt(filters.dateTo!)}`;
    chips.push({
      key: "date",
      label: "Date",
      value,
      onRemove: () => onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined }),
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {leading}
        {leading && <div className="hidden sm:block h-5 w-px bg-border" />}
        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={filters.search || ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value || undefined })
            }
            className="!h-8 pl-8 pr-8 text-sm"
          />
          {filters.search && (
            <button
              onClick={() => onFiltersChange({ ...filters, search: undefined })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-2 font-normal",
                activeFilterCount > 0 && "border-primary/50 bg-primary/5"
              )}
            >
              <ListFilter className="size-3.5" />
              Filters
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="start">
            {/* Tool */}
            {tools.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  Tool
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tools.map((tool) => (
                    <DropdownMenuCheckboxItem
                      key={tool.value}
                      checked={(filters.tools ?? []).includes(tool.value)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          tools: toggleArray(filters.tools, tool.value, checked),
                        })
                      }
                    >
                      {tool.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Risk level */}
            {!hideAdvancedFilters && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  Risk level
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {riskLevelOptions.map((level) => (
                    <DropdownMenuCheckboxItem
                      key={level.value}
                      checked={(filters.riskLevels ?? []).includes(level.value)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          riskLevels: toggleArray(filters.riskLevels, level.value, checked),
                        })
                      }
                    >
                      {level.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Event type */}
            {!hideAdvancedFilters && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  Event type
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {(() => {
                    const visibleBands = EVENT_TYPE_BAND_ORDER.filter(
                      (b) => EVENT_TYPES_BY_BAND[b].length > 0
                    );
                    return visibleBands.map((band, idx) => (
                      <div key={band}>
                        <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {EVENT_TYPE_BAND_LABEL[band]}
                        </div>
                        {EVENT_TYPES_BY_BAND[band].map((type) => (
                          <DropdownMenuCheckboxItem
                            key={type}
                            checked={(filters.eventTypes ?? []).includes(type)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={(checked) =>
                              onFiltersChange({
                                ...filters,
                                eventTypes: toggleArray(filters.eventTypes, type, checked),
                              })
                            }
                          >
                            <span className={cn("mr-1.5 inline-block size-1.5 shrink-0 rounded-[2px]", EVENT_TYPE_BAND_DOT_CLASS[band])} />
                            {EVENT_TYPE_META[type].label}
                          </DropdownMenuCheckboxItem>
                        ))}
                        {idx < visibleBands.length - 1 && <DropdownMenuSeparator />}
                      </div>
                    ));
                  })()}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Project */}
            {!hideAdvancedFilters && projects && projects.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  Project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {projects.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.id}
                      checked={(filters.projectIds ?? []).includes(p.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          projectIds: toggleArray(filters.projectIds, p.id, checked),
                        })
                      }
                    >
                      {p.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* User */}
            {!hideAdvancedFilters && members && members.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  User
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {members.map((member) => {
                    const uid = organizationMemberUserId(member);
                    if (!uid) return null;
                    const label = getMemberDisplayName(member.user);
                    return (
                      <DropdownMenuCheckboxItem
                        key={member.id}
                        checked={filters.userId === uid}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) =>
                          onFiltersChange({
                            ...filters,
                            userId: checked ? uid : undefined,
                            userName: checked ? label : undefined,
                          })
                        }
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Confidence (Not Assigned tab only) */}
            {showConfidence && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-sm">
                  Confidence
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {confidenceOptions.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={filters.minConfidence === opt.value}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          minConfidence: checked ? opt.value : undefined,
                        })
                      }
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Date range */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className={cn(
                  "text-sm",
                  (filters.dateFrom || filters.dateTo) && "text-foreground"
                )}
              >
                Date range
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(
                  [
                    { key: "today", label: "Today" },
                    { key: "yesterday", label: "Yesterday" },
                    { key: "this_week", label: "This week" },
                    { key: "this_month", label: "This month" },
                  ] as const
                ).map(({ key, label }) => (
                  <DropdownMenuItem
                    key={key}
                    className="text-sm"
                    onClick={() => {
                      const { from, to } = getDatePreset(key);
                      onFiltersChange({ ...filters, dateFrom: from, dateTo: to });
                    }}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-sm" onClick={openCustomDialog}>
                  Custom range…
                </DropdownMenuItem>
                {(filters.dateFrom || filters.dateTo) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-muted-foreground"
                      onClick={() =>
                        onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })
                      }
                    >
                      Clear dates
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {activeFilterCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-sm" onClick={clearAll}>
                  Clear all filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {trailing && (
          <div className="sm:ml-auto flex items-center gap-2">
            {trailing}
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              value={chip.value}
              onRemove={chip.onRemove}
            />
          ))}
        </div>
      )}

      {/* Custom date range dialog */}
      <Dialog open={customDateOpen} onOpenChange={setCustomDateOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="custom-date-from" className="text-sm text-muted-foreground">From</label>
              <Input
                id="custom-date-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="custom-date-to" className="text-sm text-muted-foreground">To</label>
              <Input
                id="custom-date-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 text-sm"
                aria-invalid={!!(customFrom && customTo && customFrom > customTo)}
              />
              {customFrom && customTo && customFrom > customTo && (
                <p className="text-xs text-destructive">"To" must be after "From"</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCustomDateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyCustomDates}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

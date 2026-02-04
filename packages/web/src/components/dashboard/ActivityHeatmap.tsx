import { useMemo, useState, useEffect, useRef } from 'react';
import { Activity, Calendar, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ToolBreakdown {
  name: string;
  events: number;
  tokens: number;
  color?: string;
}

interface ModelBreakdown {
  name: string;
  tokens: number;
}

interface ActivityData {
  date: string;
  count: number;
  tokens?: number;
  tools?: ToolBreakdown[];
  models?: ModelBreakdown[];
}

interface ActivityHeatmapProps {
  data: ActivityData[];
  className?: string;
}

const DAYS_OF_WEEK_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_OF_WEEK_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TOOL_COLORS: Record<string, string> = {
  'Claude Code': 'bg-amber-500',
  'GitHub Copilot': 'bg-blue-500',
  'Cursor': 'bg-purple-500',
  'Aider': 'bg-green-500',
  'default': 'bg-gray-500',
};

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted/30 dark:bg-muted/20';
  const intensity = count / maxCount;
  if (intensity < 0.25) return 'bg-emerald-400/40 dark:bg-emerald-500/30';
  if (intensity < 0.5) return 'bg-emerald-400/60 dark:bg-emerald-500/50';
  if (intensity < 0.75) return 'bg-emerald-400/80 dark:bg-emerald-500/70';
  return 'bg-emerald-500 dark:bg-emerald-400';
}

function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

interface DayData {
  date: string;
  count: number;
  tokens?: number;
  tools?: ToolBreakdown[];
  models?: ModelBreakdown[];
  dayOfWeek: number;
}

function DayTooltip({ day }: { day: DayData }) {
  const hasActivity = day.count > 0;

  return (
    <div className="min-w-[200px]">
      {/* Date header */}
      <div className="flex items-center gap-2 text-foreground mb-3">
        <Calendar className="size-4 text-muted-foreground" />
        <span className="font-medium">{formatDateLong(day.date)}</span>
      </div>

      {hasActivity ? (
        <>
          {/* Stats row */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <Activity className="size-4 text-muted-foreground" />
              <span>{formatNumber(day.count)} events</span>
            </div>
            {day.tokens !== undefined && day.tokens > 0 && (
              <div className="flex items-center gap-1.5">
                <Zap className="size-4 text-muted-foreground" />
                <span>{formatNumber(day.tokens)} tokens</span>
              </div>
            )}
          </div>

          {/* Tools breakdown */}
          {day.tools && day.tools.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
                Tools
              </div>
              <div className="space-y-1">
                {day.tools.map((tool) => (
                  <div key={tool.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={cn('size-2 rounded-full', tool.color || TOOL_COLORS[tool.name] || TOOL_COLORS.default)} />
                      <span>{tool.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatNumber(tool.events)} / {formatNumber(tool.tokens)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Models breakdown */}
          {day.models && day.models.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
                Models
              </div>
              <div className="space-y-1">
                {day.models.map((model) => (
                  <div key={model.name} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs truncate max-w-[140px]">{model.name}</span>
                    <span className="text-muted-foreground">{formatNumber(model.tokens)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No activity</p>
      )}
    </div>
  );
}

// Calculate optimal weeks to display based on container width
function calculateWeeksToShow(containerWidth: number): number {
  // Each cell needs minimum ~8px + 2px gap = 10px, plus day labels ~24px
  // So available width for cells = containerWidth - 24
  const availableWidth = containerWidth - 24;
  const cellSize = 10; // minimum cell width + gap
  const maxWeeks = Math.floor(availableWidth / cellSize);

  // Clamp between 12 (3 months) and 53 (full year)
  return Math.max(12, Math.min(53, maxWeeks));
}

export function ActivityHeatmap({ data, className }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [weeksToShow, setWeeksToShow] = useState(53);
  const [isCompact, setIsCompact] = useState(false);

  // Observe container width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const width = entry.contentRect.width;
        setWeeksToShow(calculateWeeksToShow(width));
        setIsCompact(width < 500);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { weeks, months, maxCount, totalEvents, totalTokens, activeDays } = useMemo(() => {
    // Create a map of date -> data
    const countMap = new Map<string, ActivityData>();
    let max = 0;
    let events = 0;
    let tokens = 0;
    let active = 0;

    data.forEach((item) => {
      countMap.set(item.date, item);
      if (item.count > max) max = item.count;
      events += item.count;
      tokens += item.tokens || 0;
      if (item.count > 0) active++;
    });

    // Generate weeks of data based on weeksToShow
    const today = new Date();
    const daysToGoBack = (weeksToShow - 1) * 7;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysToGoBack);

    // Adjust to start on Sunday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const weeksData: DayData[][] = [];
    const monthsData: { label: string; weekIndex: number }[] = [];

    let currentWeek: DayData[] = [];
    let currentDate = new Date(startDate);
    let lastMonth = -1;
    let weekIndex = 0;

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = countMap.get(dateStr);
      const month = currentDate.getMonth();

      // Track month changes for labels
      if (month !== lastMonth) {
        monthsData.push({ label: MONTHS[month], weekIndex });
        lastMonth = month;
      }

      currentWeek.push({
        date: dateStr,
        count: dayData?.count || 0,
        tokens: dayData?.tokens,
        tools: dayData?.tools,
        models: dayData?.models,
        dayOfWeek: currentDate.getDay(),
      });

      // If we've filled a week (Saturday), start a new one
      if (currentDate.getDay() === 6) {
        weeksData.push(currentWeek);
        currentWeek = [];
        weekIndex++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Push any remaining days
    if (currentWeek.length > 0) {
      weeksData.push(currentWeek);
    }

    return {
      weeks: weeksData,
      months: monthsData,
      maxCount: max || 1,
      totalEvents: events,
      totalTokens: tokens,
      activeDays: active,
    };
  }, [data, weeksToShow]);

  const dayLabels = isCompact ? DAYS_OF_WEEK_SHORT : DAYS_OF_WEEK_FULL;
  const labelWidth = isCompact ? 16 : 28;

  return (
    <div ref={containerRef} className={cn('rounded-xl border bg-card p-4 sm:p-6', className)}>
      {/* Header - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Activity className="size-4 sm:size-5 text-emerald-500" />
          <span className="font-semibold text-sm sm:text-base">Activity</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-muted-foreground">
          <span>
            <span className="text-foreground font-medium">{formatNumber(totalEvents)}</span> events
          </span>
          {totalTokens > 0 && (
            <span>
              <span className="text-foreground font-medium">{formatNumber(totalTokens)}</span> tokens
            </span>
          )}
          <span>
            <span className="text-foreground font-medium">{activeDays}</span> active days
          </span>
        </div>
      </div>

      {/* Heatmap container */}
      <div className="w-full">
        {/* Month labels */}
        <div
          className="flex mb-1 sm:mb-2 text-[10px] sm:text-xs text-muted-foreground"
          style={{ paddingLeft: `${labelWidth + 4}px` }}
        >
          {months.map((month, i) => {
            const nextMonth = months[i + 1];
            const colWidth = (weeks.length > 0) ? 100 / weeks.length : 1;
            const widthPercent = nextMonth
              ? (nextMonth.weekIndex - month.weekIndex) * colWidth
              : (weeks.length - month.weekIndex) * colWidth;

            // Skip month label if it would be too cramped
            if (widthPercent < 5) return null;

            return (
              <div
                key={`${month.label}-${i}`}
                style={{ width: `${widthPercent}%` }}
              >
                {month.label}
              </div>
            );
          })}
        </div>

        <div className="flex items-stretch">
          {/* Day of week labels */}
          <div
            className="grid grid-rows-7 gap-[1px] sm:gap-[2px] mr-1 text-[10px] sm:text-xs text-muted-foreground shrink-0"
            style={{ width: `${labelWidth}px` }}
          >
            {dayLabels.map((day, idx) => (
              <div
                key={`${day}-${idx}`}
                className="flex items-center justify-end h-full"
              >
                {/* Only show every other day label on very compact views */}
                {isCompact ? (idx % 2 === 1 ? day : '') : day}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div
            className="flex-1 grid gap-[1px] sm:gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
            }}
          >
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="grid grid-rows-7 gap-[1px] sm:gap-[2px]">
                {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                  const day = week.find((d) => d.dayOfWeek === dayIdx);
                  if (!day) {
                    return <div key={dayIdx} className="aspect-square w-full" />;
                  }
                  return (
                    <Tooltip key={dayIdx} delayDuration={100}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'aspect-square w-full rounded-[2px] sm:rounded-sm transition-colors cursor-default',
                            getIntensityClass(day.count, maxCount),
                            day.count > 0 && 'hover:ring-1 hover:ring-emerald-400/50 hover:ring-offset-1 hover:ring-offset-background'
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-popover text-popover-foreground border shadow-lg p-3 z-50"
                        sideOffset={5}
                      >
                        <DayTooltip day={day} />
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 mt-3 sm:mt-4 text-[10px] sm:text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-[2px] sm:gap-1">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded bg-muted/30 dark:bg-muted/20" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded bg-emerald-400/40 dark:bg-emerald-500/30" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded bg-emerald-400/60 dark:bg-emerald-500/50" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded bg-emerald-400/80 dark:bg-emerald-500/70" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded bg-emerald-500 dark:bg-emerald-400" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

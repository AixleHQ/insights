import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ActivityData {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: ActivityData[];
  className?: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted';
  const intensity = count / maxCount;
  if (intensity < 0.25) return 'bg-emerald-200 dark:bg-emerald-900';
  if (intensity < 0.5) return 'bg-emerald-400 dark:bg-emerald-700';
  if (intensity < 0.75) return 'bg-emerald-500 dark:bg-emerald-500';
  return 'bg-emerald-600 dark:bg-emerald-400';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ActivityHeatmap({ data, className }: ActivityHeatmapProps) {
  const { weeks, months, maxCount } = useMemo(() => {
    // Create a map of date -> count
    const countMap = new Map<string, number>();
    let max = 0;
    data.forEach(({ date, count }) => {
      countMap.set(date, count);
      if (count > max) max = count;
    });

    // Generate last 52 weeks of data
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364); // Go back ~52 weeks

    // Adjust to start on Sunday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const weeksData: { date: string; count: number; dayOfWeek: number }[][] = [];
    const monthsData: { label: string; weekIndex: number }[] = [];

    let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];
    let currentDate = new Date(startDate);
    let lastMonth = -1;
    let weekIndex = 0;

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = countMap.get(dateStr) || 0;
      const month = currentDate.getMonth();

      // Track month changes for labels
      if (month !== lastMonth) {
        monthsData.push({ label: MONTHS[month], weekIndex });
        lastMonth = month;
      }

      currentWeek.push({
        date: dateStr,
        count,
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

    return { weeks: weeksData, months: monthsData, maxCount: max || 1 };
  }, [data]);

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="min-w-fit">
        {/* Month labels */}
        <div className="flex pl-8 mb-1">
          {months.map((month, i) => (
            <div
              key={`${month.label}-${i}`}
              className="text-xs text-muted-foreground"
              style={{
                marginLeft: i === 0 ? `${month.weekIndex * 12}px` : undefined,
                width: i < months.length - 1
                  ? `${(months[i + 1].weekIndex - month.weekIndex) * 12}px`
                  : undefined,
              }}
            >
              {month.label}
            </div>
          ))}
        </div>

        <div className="flex">
          {/* Day of week labels */}
          <div className="flex flex-col gap-[2px] mr-2 text-xs text-muted-foreground">
            {DAYS_OF_WEEK.map((day, i) => (
              <div
                key={day}
                className="h-[10px] flex items-center"
                style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex gap-[2px]">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[2px]">
                {DAYS_OF_WEEK.map((_, dayIdx) => {
                  const day = week.find((d) => d.dayOfWeek === dayIdx);
                  if (!day) {
                    return <div key={dayIdx} className="w-[10px] h-[10px]" />;
                  }
                  return (
                    <Tooltip key={dayIdx}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'w-[10px] h-[10px] rounded-[2px] transition-colors',
                            getIntensityClass(day.count, maxCount),
                            'hover:ring-1 hover:ring-foreground/20'
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">
                          {day.count} event{day.count !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(day.date)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-[2px]">
            <div className="w-[10px] h-[10px] rounded-[2px] bg-muted" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-200 dark:bg-emerald-900" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-400 dark:bg-emerald-700" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-500 dark:bg-emerald-500" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-600 dark:bg-emerald-400" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

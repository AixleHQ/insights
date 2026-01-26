import { useState } from 'react';
import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface EventFiltersState {
  search?: string;
  tool?: string;
  riskLevel?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface EventFiltersProps {
  filters: EventFiltersState;
  onFiltersChange: (filters: EventFiltersState) => void;
  tools: string[];
  className?: string;
}

const riskLevels = ['critical', 'high', 'medium', 'low', 'none'];
const eventTypes = ['prompt', 'completion', 'function_call', 'file_operation'];

export function EventFilters({
  filters,
  onFiltersChange,
  tools,
  className,
}: EventFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ''
  ).length;

  const updateFilter = (key: keyof EventFiltersState, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-1 max-w-sm">
        <Input
          placeholder="Search events..."
          value={filters.search || ''}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pr-8"
        />
        {filters.search && (
          <button
            onClick={() => updateFilter('search', undefined)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tool</Label>
                <Select
                  value={filters.tool || ''}
                  onValueChange={(value) => updateFilter('tool', value)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All tools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All tools</SelectItem>
                    {tools.map((tool) => (
                      <SelectItem key={tool} value={tool}>
                        {tool}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Risk Level</Label>
                <Select
                  value={filters.riskLevel || ''}
                  onValueChange={(value) => updateFilter('riskLevel', value)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All levels</SelectItem>
                    {riskLevels.map((level) => (
                      <SelectItem key={level} value={level} className="capitalize">
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Event Type</Label>
                <Select
                  value={filters.eventType || ''}
                  onValueChange={(value) => updateFilter('eventType', value)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    {eventTypes.map((type) => (
                      <SelectItem key={type} value={type} className="capitalize">
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

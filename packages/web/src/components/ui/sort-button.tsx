import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type SortDirection = 'asc' | 'desc';

interface SortButtonProps<T extends string> {
  field: T;
  currentField?: T;
  currentDirection?: SortDirection;
  onSort?: (field: T) => void;
  children: React.ReactNode;
}

export function SortButton<T extends string>({
  field,
  currentField,
  currentDirection,
  onSort,
  children,
}: SortButtonProps<T>) {
  const isActive = currentField === field;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => onSort?.(field)}
    >
      {children}
      {isActive ? (
        currentDirection === 'asc' ? (
          <ArrowUp className="ml-2 size-3" />
        ) : (
          <ArrowDown className="ml-2 size-3" />
        )
      ) : (
        <ArrowUpDown className="ml-2 size-3 opacity-50" />
      )}
    </Button>
  );
}

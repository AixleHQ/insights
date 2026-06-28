import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface ColumnDef<T> {
  key: keyof T
  label: string
  render?: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

export interface DataTableProps<T extends object> {
  columns: ColumnDef<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyState?: React.ReactNode
  isLoading?: boolean
  className?: string
}

function defaultCell(value: unknown, key: PropertyKey): string {
  if (value !== null && typeof value === "object") {
    if (import.meta.env.DEV) {
      console.warn(
        `DataTable: column "${String(key)}" received an object value without a render function. Provide a render prop for this column.`
      )
    }
    return ""
  }
  return String(value ?? "")
}

function DataTableSkeletonRows<T>({
  columns,
  count = 5,
}: {
  columns: ColumnDef<T>[]
  count?: number
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          {columns.map((col) => (
            <TableCell key={String(col.key)} className={col.className}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function DataTable<T extends object>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyState,
  isLoading = false,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("rounded-md border overflow-x-auto", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={String(col.key)} className={col.headerClassName}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <DataTableSkeletonRows columns={columns} />
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyState ?? (
                  <p className="text-muted-foreground text-sm">No data</p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <TableCell key={String(col.key)} className={col.className}>
                    {col.render
                      ? col.render(row)
                      : defaultCell(row[col.key], col.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

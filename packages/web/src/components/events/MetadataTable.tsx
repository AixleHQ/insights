import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

export interface MetadataTableProps {
  metadata?: Record<string, unknown> | null;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Renders event metadata as a key/value table rather than a raw JSON blob,
 * so operators can scan fields without parsing stringified JSON.
 */
export function MetadataTable({ metadata }: MetadataTableProps) {
  const entries = metadata ? Object.entries(metadata) : [];

  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        No metadata available
      </p>
    );
  }

  return (
    <Table>
      <TableBody>
        {entries.map(([key, value]) => (
          <TableRow key={key}>
            <TableCell className="font-medium text-muted-foreground align-top whitespace-nowrap">
              {key}
            </TableCell>
            <TableCell className="whitespace-pre-wrap break-all">
              {renderValue(value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

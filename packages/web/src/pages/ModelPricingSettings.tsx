import { useOrg } from "@/contexts/OrgContext";
import { useModelPricing } from "@/hooks/useApi";
import { formatCost } from "@/lib/formatters";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Info } from "lucide-react";
import type { PricingEntry } from "@/lib/types";

function PricingTable({
  entries,
  isLoading,
}: {
  entries: PricingEntry[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">No pricing data available.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Input / M tokens</TableHead>
          <TableHead className="text-right">Output / M tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.name}>
            <TableCell className="font-mono text-sm">{entry.name}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCost(entry.input_per_mtok)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCost(entry.output_per_mtok)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ModelPricingSettings() {
  const { currentOrg } = useOrg();
  const { data, isLoading } = useModelPricing(currentOrg?.id ?? "");

  const models = data?.models;
  const tools = data?.tools;

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="size-4" />
        <p className="text-sm text-muted-foreground">
          These are Anthropic, OpenAI, and Google{" "}
          <span className="font-semibold">list prices</span> used for cost estimation. Actual costs
          from provider APIs are shown separately on individual event records.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Model Pricing</CardTitle>
          <CardDescription>
            Per-model list prices in USD per million tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricingTable entries={models} isLoading={isLoading} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool Pricing</CardTitle>
          <CardDescription>
            Estimated average prices per tool when the exact model is unknown, in USD per million
            tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricingTable entries={tools} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

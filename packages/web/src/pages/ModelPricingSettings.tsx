import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import {
  useModelPricing,
  useModelPricingOverrides,
  useCreateModelPricingOverride,
  useUpdateModelPricingOverride,
  useDeleteModelPricingOverride,
} from "@/hooks/useApi";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Info, Plus, Pencil, Trash2, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PricingEntry, ModelPricingOverride } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

interface OverrideFormState {
  model_pattern: string;
  input_per_mtok: string;
  output_per_mtok: string;
}

const emptyForm = (): OverrideFormState => ({
  model_pattern: "",
  input_per_mtok: "",
  output_per_mtok: "",
});

function validateOverrideForm(form: OverrideFormState): string | null {
  if (!form.model_pattern.trim()) return "Model pattern is required.";
  const input = parseFloat(form.input_per_mtok);
  const output = parseFloat(form.output_per_mtok);
  if (isNaN(input) || input <= 0) return "Input price must be a positive number.";
  if (isNaN(output) || output <= 0) return "Output price must be a positive number.";
  return null;
}

function ModelPatternCombobox({
  value,
  onChange,
  suggestions,
  placeholder = "gpt-4o-ft-acme",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(inputValue.toLowerCase())
  );

  function handleInputChange(v: string) {
    setInputValue(v);
    onChange(v);
  }

  function handleSelect(selected: string) {
    setInputValue(selected);
    onChange(selected);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between font-mono text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a model pattern…"
            value={inputValue}
            onValueChange={handleInputChange}
          />
          <CommandList>
            {inputValue && !suggestions.includes(inputValue) && (
              <CommandGroup heading="Custom">
                <CommandItem value={inputValue} onSelect={() => handleSelect(inputValue)}>
                  <Check className={cn("mr-2 size-4", value === inputValue ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono">{inputValue}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup heading="Known models">
                {filtered.map((model) => (
                  <CommandItem key={model} value={model} onSelect={() => handleSelect(model)}>
                    <Check className={cn("mr-2 size-4", value === model ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-sm">{model}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {filtered.length === 0 && !inputValue && (
              <CommandEmpty>Type to search or enter a custom pattern.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OverridesSection({ orgId }: { orgId: string }) {
  const { data, isLoading } = useModelPricingOverrides(orgId);
  const { data: pricingData } = useModelPricing(orgId);
  const createMutation = useCreateModelPricingOverride(orgId);
  const updateMutation = useUpdateModelPricingOverride(orgId);
  const deleteMutation = useDeleteModelPricingOverride(orgId);

  const modelSuggestions = pricingData?.models.map((m) => m.name) ?? [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<OverrideFormState>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<OverrideFormState>(emptyForm());
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const overrides = data?.data ?? [];

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateOverrideForm(addForm);
    if (err) { setAddError(err); return; }
    setAddError(null);
    createMutation.mutate(
      {
        modelPattern: addForm.model_pattern.trim(),
        inputPerMtok: parseFloat(addForm.input_per_mtok),
        outputPerMtok: parseFloat(addForm.output_per_mtok),
      },
      {
        onSuccess: () => { setAddForm(emptyForm()); setShowAddForm(false); },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to create override.";
          setAddError(msg);
        },
      }
    );
  }

  function handleEditStart(override: ModelPricingOverride) {
    setEditingId(override.id);
    setEditForm({
      model_pattern: override.modelPattern,
      input_per_mtok: String(override.inputPerMtok),
      output_per_mtok: String(override.outputPerMtok),
    });
    setEditError(null);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const err = validateOverrideForm(editForm);
    if (err) { setEditError(err); return; }
    setEditError(null);
    updateMutation.mutate(
      {
        id: editingId,
        modelPattern: editForm.model_pattern.trim(),
        inputPerMtok: parseFloat(editForm.input_per_mtok),
        outputPerMtok: parseFloat(editForm.output_per_mtok),
      },
      {
        onSuccess: () => { setEditingId(null); },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to update override.";
          setEditError(msg);
        },
      }
    );
  }

  function handleDelete(id: string) {
    setDeleteTargetId(id);
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    deleteMutation.mutate(deleteTargetId, {
      onSuccess: () => setDeleteTargetId(null),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overrides.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model Pattern</TableHead>
              <TableHead className="text-right">Input / M tokens</TableHead>
              <TableHead className="text-right">Output / M tokens</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map((override) =>
              editingId === override.id ? (
                <TableRow key={override.id}>
                  <TableCell>
                    <Input
                      value={editForm.model_pattern}
                      onChange={(e) => setEditForm((f) => ({ ...f, model_pattern: e.target.value }))}
                      className="h-8 font-mono text-sm"
                      placeholder="gpt-4o-ft-acme"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={editForm.input_per_mtok}
                      onChange={(e) => setEditForm((f) => ({ ...f, input_per_mtok: e.target.value }))}
                      className="h-8 text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={editForm.output_per_mtok}
                      onChange={(e) => setEditForm((f) => ({ ...f, output_per_mtok: e.target.value }))}
                      className="h-8 text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <form onSubmit={handleEditSubmit} className="flex gap-1 justify-end">
                      <Button type="submit" size="icon" variant="ghost" className="h-8 w-8"
                        disabled={updateMutation.isPending}>
                        <Check className="size-4 text-green-600" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => setEditingId(null)}>
                        <X className="size-4" />
                      </Button>
                    </form>
                    {editError && (
                      <p className="mt-1 text-xs text-destructive">{editError}</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={override.id}>
                  <TableCell className="font-mono text-sm">{override.modelPattern}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCost(override.inputPerMtok)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCost(override.outputPerMtok)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEditStart(override)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(override.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      )}

      {overrides.length === 0 && !showAddForm && (
        <p className="py-2 text-sm text-muted-foreground">
          No overrides configured. Add one to apply custom pricing for specific models.
        </p>
      )}

      {showAddForm ? (
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-3 rounded-md border p-4">
          <p className="text-sm font-medium">New override</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1">
              <label className="text-xs text-muted-foreground">Model pattern</label>
              <ModelPatternCombobox
                value={addForm.model_pattern}
                onChange={(v) => setAddForm((f) => ({ ...f, model_pattern: v }))}
                suggestions={modelSuggestions}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Input ($/MTok)</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={addForm.input_per_mtok}
                onChange={(e) => setAddForm((f) => ({ ...f, input_per_mtok: e.target.value }))}
                placeholder="1.50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Output ($/MTok)</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={addForm.output_per_mtok}
                onChange={(e) => setAddForm((f) => ({ ...f, output_per_mtok: e.target.value }))}
                placeholder="6.00"
              />
            </div>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save override"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setShowAddForm(false); setAddForm(emptyForm()); setAddError(null); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="size-4" />
          Add override
        </Button>
      )}

      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pricing override?</AlertDialogTitle>
            <AlertDialogDescription>
              This override will be removed and cost calculations will fall back to list prices.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ModelPricingSettings() {
  const { currentOrg, hasRole } = useOrg();
  const { data, isLoading } = useModelPricing(currentOrg?.id ?? "");
  const isAdmin = hasRole(["owner", "admin"]);

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

      {isAdmin && currentOrg && (
        <Card>
          <CardHeader>
            <CardTitle>Pricing Overrides</CardTitle>
            <CardDescription>
              Custom prices for org-specific or fine-tuned models. Overrides take precedence over
              list prices above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OverridesSection orgId={currentOrg.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

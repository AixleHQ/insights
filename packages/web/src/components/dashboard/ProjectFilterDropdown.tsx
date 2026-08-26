import { useProjects } from "@/hooks/useApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectFilterDropdownProps {
  orgId: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  /** Label for the unscoped option — F4-S1 / Figma use "All Projects". */
  allLabel?: string;
  // w-48 keeps the trigger fixed-width so it doesn't jump when the selected
  // project name changes length (introduced by AIX-607 fix).
  className?: string;
}


export function ProjectFilterDropdown({
  orgId,
  value,
  onChange,
  allLabel = "All Projects",
  className = "w-48",
}: ProjectFilterDropdownProps) {
  const { data: projects } = useProjects(orgId);

  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : v)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        <SelectItem value="none">No Project</SelectItem>
        {projects?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

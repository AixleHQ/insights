import { useProjects } from "@/hooks/useApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Shared project scope selector for the dashboard filter bar. Used by both the
// Team (OrgDashboard) and Personal (MemberDashboard) tabs so the control style,
// labeling, and placement stay identical when switching tabs (AIX-607).
export function ProjectFilterDropdown({
  orgId,
  value,
  onChange,
  allLabel = "All Projects",
  className = "w-48",
}: {
  orgId: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allLabel?: string;
  className?: string;
}) {
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEMBER_PERIODS, MEMBER_PERIOD_LABELS, type MemberPeriod } from "./memberPeriods";

// Period dropdown for the Personal dashboard. Mirrors OrgDashboard's month
// PeriodSelector control style/placement so the filter bar doesn't jump when
// switching Team ↔ Personal (AIX-607).
export function MemberPeriodSelect({
  value,
  onChange,
}: {
  value: MemberPeriod;
  onChange: (p: MemberPeriod) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MemberPeriod)}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MEMBER_PERIODS.map((p) => (
          <SelectItem key={p} value={p}>
            {MEMBER_PERIOD_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

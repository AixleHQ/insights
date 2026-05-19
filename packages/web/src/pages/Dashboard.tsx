import { useOrg } from "@/contexts/OrgContext";
import { OrgDashboard } from "./OrgDashboard";
import { MemberDashboard } from "./MemberDashboard";

export function Dashboard() {
  const { currentRole } = useOrg();
  if (currentRole === "member") return <MemberDashboard />;
  return <OrgDashboard />;
}

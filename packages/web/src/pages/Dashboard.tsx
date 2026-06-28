import { OrgDashboard } from "./OrgDashboard";

// AIX-381: all org roles (including plain members) see the org-wide dashboard.
// Personal stats remain available via the "Personal" tab inside OrgDashboard.
export function Dashboard() {
  return <OrgDashboard />;
}

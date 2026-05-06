import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Building2,
  Users,
  Activity,
  DollarSign,
  MoreVertical,
  ExternalLink,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow, formatCurrency } from "@/lib/utils";

type OrgSortField = "name" | "members_count" | "events_count" | "total_cost_usd" | "created_at";

interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  status: "active" | "suspended" | "trial";
  members_count: number;
  projects_count: number;
  events_count: number;
  total_cost_usd: number;
  created_at: string;
  last_event_at: string | null;
}

function OrgSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-12" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="size-8" />
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: AdminOrganization["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="default">Active</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "trial":
      return <Badge variant="secondary">Trial</Badge>;
    default:
      return null;
  }
}

function PlanBadge({ plan }: { plan: string }) {
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    enterprise: "default",
    team: "secondary",
    free: "outline",
  };
  return (
    <Badge variant={variants[plan] || "outline"} className="capitalize">
      {plan}
    </Badge>
  );
}

export function AdminOrganizations() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<OrgSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: organizations, isLoading } = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: () => api.get<AdminOrganization[]>("/admin/organizations"),
  });

  const handleSort = (field: OrgSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPlanFilter("all");
  };

  const hasActiveFilters = search || statusFilter !== "all" || planFilter !== "all";

  const filteredOrgs = useMemo(() => {
    if (!organizations) return [];

    let result = [...organizations];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (org) =>
          org.name.toLowerCase().includes(searchLower) ||
          org.slug.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((org) => org.status === statusFilter);
    }

    // Apply plan filter
    if (planFilter !== "all") {
      result = result.filter((org) => org.plan === planFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "members_count":
          comparison = a.members_count - b.members_count;
          break;
        case "events_count":
          comparison = a.events_count - b.events_count;
          break;
        case "total_cost_usd":
          comparison = a.total_cost_usd - b.total_cost_usd;
          break;
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [organizations, search, statusFilter, planFilter, sortField, sortDirection]);

  const totalCost = useMemo(() => {
    return organizations?.reduce((sum, org) => sum + org.total_cost_usd, 0) || 0;
  }, [organizations]);

  const totalEvents = useMemo(() => {
    return organizations?.reduce((sum, org) => sum + org.events_count, 0) || 0;
  }, [organizations]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">
            Manage all organizations on the platform
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4" />
            <span>{totalEvents.toLocaleString()} events</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="size-4" />
            <span>{formatCurrency(totalCost)} total</span>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Building2 className="size-3" />
            {organizations?.length || 0} orgs
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="free">Free</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 size-4" />
            Clear filters
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">
                <SortButton
                  field="name"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Organization
                </SortButton>
              </TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[90px]">Plan</TableHead>
              <TableHead className="w-[80px]">
                <SortButton
                  field="members_count"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Members
                </SortButton>
              </TableHead>
              <TableHead className="w-[100px]">
                <SortButton
                  field="events_count"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Events
                </SortButton>
              </TableHead>
              <TableHead className="w-[100px]">
                <SortButton
                  field="total_cost_usd"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Cost
                </SortButton>
              </TableHead>
              <TableHead className="w-[120px]">
                <SortButton
                  field="created_at"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Created
                </SortButton>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => <OrgSkeleton key={i} />)
            ) : filteredOrgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? "No organizations found" : "No organizations yet"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredOrgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground">
                        {org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt={org.name}
                            className="size-10 rounded-lg object-cover"
                          />
                        ) : (
                          org.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">/{org.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={org.status} />
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={org.plan} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 font-mono text-sm">
                      <Users className="size-3 text-muted-foreground" />
                      {org.members_count}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {org.events_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatCurrency(org.total_cost_usd)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(org.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/organizations/${org.id}/webhook-deliveries`}>
                            Webhook deliveries
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/organizations/${org.id}`}>
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <ExternalLink className="mr-2 size-4" />
                          View as Org
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Edit Settings</DropdownMenuItem>
                        <DropdownMenuItem>Change Plan</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {org.status === "active" ? (
                          <DropdownMenuItem className="text-destructive">
                            Suspend Organization
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem>Activate Organization</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

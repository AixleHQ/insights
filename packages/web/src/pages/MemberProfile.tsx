import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Mail,
  Calendar,
  DollarSign,
  Activity,
  Code2,
  TrendingUp,
  ShieldCheck,
  User,
  Eye,
  Folder,
  Building2,
  Plug,
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers,
  GitCommitHorizontal,
} from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useMember, useMemberEvents, useMemberHeatmap, useMemberStats, useProject, useEvents, type MemberStatsRange } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventsTable, EventDrawer, type EventRow } from "@/components/events";
import { ActivityHeatmap } from "@/components/dashboard";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn, humanizeToolName, toEventRow } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";
import { formatTokens, formatCost, formatCount } from "@/lib/formatters";
import { RANGE_OPTIONS, RANGE_SUBTITLE } from "@/lib/memberStatsRange";

type MemberRole = "owner" | "member" | "viewer";

const roleConfig: Record<MemberRole, { label: string; icon: typeof ShieldCheck; color: string; bg: string }> = {
  owner: { label: "Owner", icon: ShieldCheck, color: "text-violet-400", bg: "bg-violet-500/10" },
  member: { label: "Member", icon: User, color: "text-blue-400", bg: "bg-blue-500/10" },
  viewer: { label: "Viewer", icon: Eye, color: "text-slate-400", bg: "bg-slate-500/10" },
};

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() || "U";
}

type EventSortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";

const riskOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Activity;
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="type-label text-muted-foreground">{title}</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="type-h1">{value}</div>
        {subtitle && <p className="mt-1 type-caption text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  );
}

type ToolSortField = "tool" | "count" | "tokens" | "cost";
type ModelSortField = "model" | "tokens" | "cost";

export interface MemberProfileViewProps {
  memberId: string;
  /** When true, hides the standalone page header (back control, avatar, identity row) for use inside User Settings. */
  embedded?: boolean;
  /** When set, shows a project-scoped commit history section. */
  projectId?: string;
}

export function MemberProfileView({ memberId, embedded = false, projectId }: MemberProfileViewProps) {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  // Time-range for headline stats, breakdowns, and the activity heatmap.
  const [range, setRange] = useState<MemberStatsRange>("30d");
  // Tool usage sorting state
  const [toolSortField, setToolSortField] = useState<ToolSortField>("count");
  const [toolSortDirection, setToolSortDirection] = useState<SortDirection>("desc");

  // Model usage sorting state
  const [modelSortField, setModelSortField] = useState<ModelSortField>("tokens");
  const [modelSortDirection, setModelSortDirection] = useState<SortDirection>("desc");

  // Recent Activity sorting state
  const [eventSortField, setEventSortField] = useState<EventSortField>("created_at");
  const [eventSortDirection, setEventSortDirection] = useState<SortDirection>("desc");

  // Project commits sorting state
  const [commitSortField, setCommitSortField] = useState<EventSortField>("created_at");
  const [commitSortDirection, setCommitSortDirection] = useState<SortDirection>("desc");

  // Event detail drawer state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleEventClick = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setDrawerOpen(true);
  }, []);

  const {
    data: member,
    isLoading: memberLoading,
    isError: memberError,
    error: memberQueryError,
  } = useMember(currentOrg?.id || "", memberId);

  // Org switch can leave a stale member id that 404s in the new org — send the user
  // to the members list. Keep other errors (network / 403 / 5xx) on the page.
  // Skip when embedded (e.g. User Settings) so a transient 404 doesn't yank navigation.
  useEffect(() => {
    if (
      !embedded &&
      !memberLoading &&
      memberError &&
      memberQueryError instanceof ApiError &&
      memberQueryError.status === 404
    ) {
      navigate(AppRoutes.members.root, { replace: true });
    }
  }, [embedded, memberLoading, memberError, memberQueryError, navigate]);
  const { data: statsData } = useMemberStats(currentOrg?.id || "", memberId, range);
  const { data: heatmapData } = useMemberHeatmap(currentOrg?.id || "", memberId);
  const { data: eventsResponse, isLoading: eventsLoading } = useMemberEvents(
    currentOrg?.id || "",
    memberId,
    { per_page: 10 }
  );

  const [projectCommitsPage, setProjectCommitsPage] = useState(1);
  const [projectCommitsPageSize, setProjectCommitsPageSize] = useState(20);

  const { data: projectData } = useProject(projectId || "");
  const { data: projectCommitsResponse, isLoading: projectCommitsLoading } = useEvents(
    currentOrg?.id || "",
    { user_id: member?.user_id, project_id: projectId, event_type: "commit", per_page: projectCommitsPageSize, page: projectCommitsPage },
    { enabled: !!projectId && !!member?.user_id }
  );

  const events: EventRow[] = useMemo(
    () => eventsResponse?.data?.map(toEventRow) ?? [],
    [eventsResponse]
  );

  const projectCommits: EventRow[] = useMemo(
    () => projectCommitsResponse?.data?.map(toEventRow) ?? [],
    [projectCommitsResponse]
  );

  const sortedEvents: EventRow[] = useMemo(() => {
    return [...events].sort((a, b) => {
      let comparison = 0;
      switch (eventSortField) {
        case "created_at":
          comparison =
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime();
          break;
        case "tool_name":
          comparison = (a.tool_name || "").localeCompare(b.tool_name || "");
          break;
        case "risk_level":
          comparison =
            (riskOrder[a.risk_level || "none"] ?? 0) -
            (riskOrder[b.risk_level || "none"] ?? 0);
          break;
        case "cost_usd":
          comparison = (a.cost_usd || 0) - (b.cost_usd || 0);
          break;
      }
      return eventSortDirection === "asc" ? comparison : -comparison;
    });
  }, [events, eventSortField, eventSortDirection]);

  const sortedProjectCommits: EventRow[] = useMemo(() => {
    return [...projectCommits].sort((a, b) => {
      let comparison = 0;
      switch (commitSortField) {
        case "created_at":
          comparison =
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime();
          break;
        case "tool_name":
          comparison = (a.tool_name || "").localeCompare(b.tool_name || "");
          break;
        case "risk_level":
          comparison =
            (riskOrder[a.risk_level || "none"] ?? 0) -
            (riskOrder[b.risk_level || "none"] ?? 0);
          break;
        case "cost_usd":
          comparison = (a.cost_usd || 0) - (b.cost_usd || 0);
          break;
      }
      return commitSortDirection === "asc" ? comparison : -comparison;
    });
  }, [projectCommits, commitSortField, commitSortDirection]);

  const handleToolSort = (field: ToolSortField) => {
    if (toolSortField === field) {
      setToolSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setToolSortField(field);
      setToolSortDirection("desc");
    }
  };

  const handleModelSort = (field: ModelSortField) => {
    if (modelSortField === field) {
      setModelSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setModelSortField(field);
      setModelSortDirection("desc");
    }
  };

  const handleEventSort = (field: EventSortField) => {
    if (eventSortField === field) {
      setEventSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setEventSortField(field);
      setEventSortDirection("desc");
    }
  };

  const handleCommitSort = (field: EventSortField) => {
    if (commitSortField === field) {
      setCommitSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setCommitSortField(field);
      setCommitSortDirection("desc");
    }
  };

  // Create stats with defaults - must be before useMemo hooks that depend on it
  const stats = statsData || {
    total_events: 0,
    total_cost: 0,
    events_today: 0,
    events_this_week: 0,
    events_this_month: 0,
    most_used_tool: null,
    tokens: { total_in: 0, total_out: 0, total: 0 },
    tool_breakdown: [],
    model_breakdown: [],
    daily_activity: [],
    projects: [],
    organizations: [],
    tool_accounts: [],
  };

  // Sorted tool breakdown - must be called before early returns (hooks rules)
  const sortedToolBreakdown = useMemo(() => {
    if (!stats.tool_breakdown) return [];
    return [...stats.tool_breakdown].sort((a, b) => {
      let comparison = 0;
      switch (toolSortField) {
        case "tool":
          comparison = (a.tool || "").localeCompare(b.tool || "");
          break;
        case "count":
          comparison = (a.count || 0) - (b.count || 0);
          break;
        case "tokens":
          comparison = (a.tokens_total || 0) - (b.tokens_total || 0);
          break;
        case "cost":
          comparison = (Number(a.cost) || 0) - (Number(b.cost) || 0);
          break;
      }
      return toolSortDirection === "asc" ? comparison : -comparison;
    });
  }, [stats.tool_breakdown, toolSortField, toolSortDirection]);

  // Sorted model breakdown - must be called before early returns (hooks rules)
  const sortedModelBreakdown = useMemo(() => {
    if (!stats.model_breakdown) return [];
    return [...stats.model_breakdown].sort((a, b) => {
      let comparison = 0;
      switch (modelSortField) {
        case "model":
          comparison = (a.model || "").localeCompare(b.model || "");
          break;
        case "tokens":
          comparison = (a.tokens_total || 0) - (b.tokens_total || 0);
          break;
        case "cost":
          comparison = (Number(a.cost) || 0) - (Number(b.cost) || 0);
          break;
      }
      return modelSortDirection === "asc" ? comparison : -comparison;
    });
  }, [stats.model_breakdown, modelSortField, modelSortDirection]);

  // Early returns must come AFTER all hooks
  if (memberLoading) {
    return <ProfileSkeleton />;
  }

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Member not found</p>
        <Button asChild variant="link" className="mt-2">
          <Link to={AppRoutes.members.root}>
            <ArrowLeft className="mr-2 size-4" />
            Back to team
          </Link>
        </Button>
      </div>
    );
  }

  const role = roleConfig[(member.role as MemberRole) || "member"];
  const RoleIcon = role.icon;

  const joinDateRaw = member.createdAt;
  const formattedJoinDate = joinDateRaw
    ? new Date(joinDateRaw).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  return (
    <div className="space-y-6">
      {/* Header — hidden when embedded under User Settings (identity is shown in Profile card above). */}
      {!embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to={AppRoutes.members.root}>
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Avatar className="size-12 sm:size-16 border-2 border-muted shrink-0">
              {member.user?.avatarUrl && (
                <AvatarImage src={member.user.avatarUrl} alt={member.user?.name || member.user?.email || "User"} />
              )}
              <AvatarFallback className="text-base sm:text-lg font-semibold bg-gradient-to-br from-primary/20 to-primary/5">
                {getInitials(member.user?.name, member.user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-lg sm:text-xl font-semibold truncate">
                  {member.user?.name || member.user?.email?.split("@")[0] || "Unknown User"}
                </h1>
                <Badge variant="outline" className={cn("gap-1 shrink-0", role.bg, role.color)}>
                  <RoleIcon className="size-3" />
                  {role.label}
                </Badge>
              </div>
              <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{member.user?.email}</span>
                </span>
                <Separator orientation="vertical" className="hidden sm:block h-4" />
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 shrink-0" />
                  Joined {formattedJoinDate}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Heatmap */}
      {heatmapData && heatmapData.length > 0 && (
        <TooltipProvider>
          <ActivityHeatmap data={heatmapData} />
        </TooltipProvider>
      )}

      {/* Time-range selector — applies to headline stats and breakdowns below */}
      <div className="flex items-center justify-end">
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={range === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Grid - Row 1 */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Events"
          value={formatCount(stats.total_events)}
          subtitle={`${stats.events_this_week} this week`}
          icon={Activity}
        />
        <StatCard
          title="Total Cost"
          value={formatCost(stats.total_cost)}
          subtitle={RANGE_SUBTITLE[range]}
          icon={DollarSign}
        />
        <StatCard
          title="Total Tokens"
          value={formatTokens(stats.tokens?.total || 0)}
          subtitle={`${formatTokens(stats.tokens?.total_in || 0)} in / ${formatTokens(stats.tokens?.total_out || 0)} out`}
          icon={Coins}
        />
        <StatCard
          title="Most Used Tool"
          value={stats.most_used_tool ? humanizeToolName(stats.most_used_tool) : "None"}
          subtitle="Primary tool"
          icon={Code2}
        />
      </div>

      {/* Token Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Tokens In</CardTitle>
            <ArrowDownToLine className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="type-h1 font-mono">
              {formatTokens(stats.tokens?.total_in || 0)}
            </div>
            <p className="mt-1 type-caption text-muted-foreground">Input tokens (prompts)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Tokens Out</CardTitle>
            <ArrowUpFromLine className="size-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="type-h1 font-mono">
              {formatTokens(stats.tokens?.total_out || 0)}
            </div>
            <p className="mt-1 type-caption text-muted-foreground">Output tokens (completions)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Today's Activity</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="type-h1">{stats.events_today}</div>
            <p className="mt-1 type-caption text-muted-foreground">Events today</p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tool Usage with Token Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <Layers className="size-4" />
              Tool Usage
            </CardTitle>
            <CardDescription>Events and tokens by AI coding tool</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedToolBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortButton
                        field="tool"
                        currentField={toolSortField}
                        currentDirection={toolSortDirection}
                        onSort={handleToolSort}
                      >
                        Tool
                      </SortButton>
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        field="count"
                        currentField={toolSortField}
                        currentDirection={toolSortDirection}
                        onSort={handleToolSort}
                      >
                        Events
                      </SortButton>
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        field="tokens"
                        currentField={toolSortField}
                        currentDirection={toolSortDirection}
                        onSort={handleToolSort}
                      >
                        Tokens
                      </SortButton>
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        field="cost"
                        currentField={toolSortField}
                        currentDirection={toolSortDirection}
                        onSort={handleToolSort}
                      >
                        Cost
                      </SortButton>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedToolBreakdown.map((tool) => (
                    <TableRow key={tool.tool}>
                      <TableCell className="font-medium">{humanizeToolName(tool.tool)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {tool.count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div>{formatTokens(tool.tokens_total)}</div>
                        <div className="type-caption text-muted-foreground">
                          {formatTokens(tool.tokens_in)} / {formatTokens(tool.tokens_out)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCost(tool.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No tool usage data</p>
            )}
          </CardContent>
        </Card>

        {/* Model Usage with Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <Code2 className="size-4" />
              Model Usage
            </CardTitle>
            <CardDescription>Tokens and pricing by AI model</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedModelBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortButton
                        field="model"
                        currentField={modelSortField}
                        currentDirection={modelSortDirection}
                        onSort={handleModelSort}
                      >
                        Model
                      </SortButton>
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        field="tokens"
                        currentField={modelSortField}
                        currentDirection={modelSortDirection}
                        onSort={handleModelSort}
                      >
                        Tokens
                      </SortButton>
                    </TableHead>
                    <TableHead className="text-right">$/M Tokens</TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        field="cost"
                        currentField={modelSortField}
                        currentDirection={modelSortDirection}
                        onSort={handleModelSort}
                      >
                        Cost
                      </SortButton>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedModelBreakdown.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium text-sm">{model.model}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatTokens(model.tokens_total)}
                      </TableCell>
                      <TableCell className="text-right font-mono type-caption text-muted-foreground">
                        <div>${model.price_per_million_input} in</div>
                        <div>${model.price_per_million_output} out</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCost(model.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No model data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Three Column Layout for Related Entities */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <Folder className="size-4" />
              Projects
            </CardTitle>
            <CardDescription>{stats.projects?.length || 0} projects</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.projects && stats.projects.length > 0 ? (
              <div className="space-y-2">
                {stats.projects.map((project) => (
                  <Link
                    key={project.id}
                    to={AppRoutes.projects.detail(project.id)}
                    className="flex items-center justify-between rounded-md border p-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium text-sm">{project.name}</span>
                    {project.from_events && (
                      <Badge variant="secondary" className="text-xs">via events</Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No projects</p>
            )}
          </CardContent>
        </Card>

        {/* Organizations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <Building2 className="size-4" />
              Organizations
            </CardTitle>
            <CardDescription>{stats.organizations?.length || 0} organizations</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.organizations && stats.organizations.length > 0 ? (
              <div className="space-y-2">
                {stats.organizations.map((org) => (
                  <div
                    key={org.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-2",
                      org.is_current && "border-primary/50 bg-primary/5"
                    )}
                  >
                    <span className="font-medium text-sm">{org.name}</span>
                    <Badge variant="outline" className="text-xs capitalize">{org.role}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No organizations</p>
            )}
          </CardContent>
        </Card>

        {/* Connected Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <Plug className="size-4" />
              Connected Tools
            </CardTitle>
            <CardDescription>{stats.tool_accounts?.length || 0} tool accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.tool_accounts && stats.tool_accounts.length > 0 ? (
              <div className="space-y-2">
                {stats.tool_accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div>
                      <div className="font-medium text-sm">{humanizeToolName(account.tool_name)}</div>
                      {account.external_username && (
                        <div className="type-caption text-muted-foreground">@{account.external_username}</div>
                      )}
                    </div>
                    <Badge
                      variant={account.connection_state === "active" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {account.connection_state === "waiting_for_connection"
                        ? "Setup required"
                        : account.connection_state === "active"
                          ? "Active"
                          : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No connected tools</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="type-body-lg">Recent Activity</CardTitle>
            <CardDescription>Latest events from this team member</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link
              to={{
                pathname: AppRoutes.events.root,
                search: `?${new URLSearchParams({
                  user_id: member.user.id,
                  ...(member.user.name ? { user_name: member.user.name } : {}),
                }).toString()}`,
              }}
            >
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <EventsTable
            events={sortedEvents}
            isLoading={eventsLoading}
            sortField={eventSortField}
            sortDirection={eventSortDirection}
            onSort={handleEventSort}
            onEventClick={handleEventClick}
            selectedEventId={selectedEventId}
            className="border-0 rounded-none"
          />
        </CardContent>
      </Card>

      {projectId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 type-body-lg">
              <GitCommitHorizontal className="size-4" />
              Commits in {projectData?.name ?? "Project"}
            </CardTitle>
            <CardDescription>
              Commit history for this member scoped to the project
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <EventsTable
              events={sortedProjectCommits}
              isLoading={projectCommitsLoading}
              sortField={commitSortField}
              sortDirection={commitSortDirection}
              onSort={handleCommitSort}
              onEventClick={handleEventClick}
              selectedEventId={selectedEventId}
              className="border-0 rounded-none"
            />
            {projectCommitsResponse?.meta && projectCommitsResponse.meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Select
                    value={String(projectCommitsPageSize)}
                    onValueChange={(v) => {
                      setProjectCommitsPageSize(Number(v));
                      setProjectCommitsPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProjectCommitsPage((p) => Math.max(1, p - 1))}
                    disabled={projectCommitsPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs">
                    Page {projectCommitsPage} of {projectCommitsResponse.meta.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProjectCommitsPage((p) => Math.min(projectCommitsResponse.meta.total_pages, p + 1))}
                    disabled={projectCommitsPage === projectCommitsResponse.meta.total_pages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <EventDrawer
        eventId={selectedEventId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}

export function MemberProfile() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? undefined;
  return <MemberProfileView key={projectId ?? ""} memberId={id ?? ""} projectId={projectId} />;
}

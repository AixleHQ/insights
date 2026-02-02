import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Calendar,
  DollarSign,
  Activity,
  Code2,
  TrendingUp,
  Shield,
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
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useMember, useMemberEvents, useMemberStats } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EventsTable, type EventRow } from '@/components/events';
import { ActivityHeatmap } from '@/components/dashboard';
import { SortButton, type SortDirection } from '@/components/ui/sort-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn, humanizeToolName } from '@/lib/utils';

type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

const roleConfig: Record<MemberRole, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  owner: { label: 'Owner', icon: ShieldCheck, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  admin: { label: 'Admin', icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  member: { label: 'Member', icon: User, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() || 'U';
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

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
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
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

type ToolSortField = 'tool' | 'count' | 'tokens' | 'cost';
type ModelSortField = 'model' | 'tokens' | 'cost';

export function MemberProfile() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();

  // Tool usage sorting state
  const [toolSortField, setToolSortField] = useState<ToolSortField>('count');
  const [toolSortDirection, setToolSortDirection] = useState<SortDirection>('desc');

  // Model usage sorting state
  const [modelSortField, setModelSortField] = useState<ModelSortField>('tokens');
  const [modelSortDirection, setModelSortDirection] = useState<SortDirection>('desc');

  const { data: member, isLoading: memberLoading } = useMember(currentOrg?.id || '', id || '');
  const { data: statsData } = useMemberStats(currentOrg?.id || '', id || '');
  const { data: eventsResponse, isLoading: eventsLoading } = useMemberEvents(
    currentOrg?.id || '',
    id || '',
    { per_page: 10 }
  );

  // Transform events to EventRow format
  const events: EventRow[] = useMemo(() => {
    if (!eventsResponse?.data) return [];
    return eventsResponse.data.map((e) => ({
      id: e.id,
      tool_name: e.toolName,
      event_type: e.eventType,
      risk_level: e.riskLevel,
      cost_usd: e.costUsd,
      token_count: (e.inputTokens || 0) + (e.outputTokens || 0),
      created_at: e.occurredAt || e.createdAt,
      user: e.user ? { email: e.user.email } : undefined,
      project: e.project ? { name: e.project.name } : undefined,
    }));
  }, [eventsResponse]);

  const handleToolSort = (field: ToolSortField) => {
    if (toolSortField === field) {
      setToolSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setToolSortField(field);
      setToolSortDirection('desc');
    }
  };

  const handleModelSort = (field: ModelSortField) => {
    if (modelSortField === field) {
      setModelSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setModelSortField(field);
      setModelSortDirection('desc');
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
        case 'tool':
          comparison = (a.tool || '').localeCompare(b.tool || '');
          break;
        case 'count':
          comparison = (a.count || 0) - (b.count || 0);
          break;
        case 'tokens':
          comparison = (a.tokens_total || 0) - (b.tokens_total || 0);
          break;
        case 'cost':
          comparison = (Number(a.cost) || 0) - (Number(b.cost) || 0);
          break;
      }
      return toolSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [stats.tool_breakdown, toolSortField, toolSortDirection]);

  // Sorted model breakdown - must be called before early returns (hooks rules)
  const sortedModelBreakdown = useMemo(() => {
    if (!stats.model_breakdown) return [];
    return [...stats.model_breakdown].sort((a, b) => {
      let comparison = 0;
      switch (modelSortField) {
        case 'model':
          comparison = (a.model || '').localeCompare(b.model || '');
          break;
        case 'tokens':
          comparison = (a.tokens_total || 0) - (b.tokens_total || 0);
          break;
        case 'cost':
          comparison = (Number(a.cost) || 0) - (Number(b.cost) || 0);
          break;
      }
      return modelSortDirection === 'asc' ? comparison : -comparison;
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
          <Link to="/team">
            <ArrowLeft className="mr-2 size-4" />
            Back to team
          </Link>
        </Button>
      </div>
    );
  }

  const role = roleConfig[(member.role as MemberRole) || 'member'];
  const RoleIcon = role.icon;

  const formattedJoinDate = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link to="/team">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Avatar className="size-16 border-2 border-muted">
            <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-primary/20 to-primary/5">
              {getInitials(member.user?.name, member.user?.email)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">
                {member.user?.name || member.user?.email?.split('@')[0] || 'Unknown User'}
              </h1>
              <Badge variant="outline" className={cn('gap-1', role.bg, role.color)}>
                <RoleIcon className="size-3" />
                {role.label}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {member.user?.email}
              </span>
              <Separator orientation="vertical" className="h-4" />
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Joined {formattedJoinDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Heatmap */}
      {stats.daily_activity && stats.daily_activity.length > 0 && (
        <TooltipProvider>
          <ActivityHeatmap data={stats.daily_activity} />
        </TooltipProvider>
      )}

      {/* Stats Grid - Row 1 */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Events"
          value={stats.total_events.toLocaleString()}
          subtitle={`${stats.events_this_week} this week`}
          icon={Activity}
        />
        <StatCard
          title="Total Cost"
          value={`$${Number(stats.total_cost || 0).toFixed(2)}`}
          subtitle="All time"
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
          value={stats.most_used_tool ? humanizeToolName(stats.most_used_tool) : 'None'}
          subtitle="Primary tool"
          icon={Code2}
        />
      </div>

      {/* Token Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tokens In</CardTitle>
            <ArrowDownToLine className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {formatTokens(stats.tokens?.total_in || 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Input tokens (prompts)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tokens Out</CardTitle>
            <ArrowUpFromLine className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {formatTokens(stats.tokens?.total_out || 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Output tokens (completions)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Activity</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.events_today}</div>
            <p className="mt-1 text-xs text-muted-foreground">Events today</p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tool Usage with Token Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
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
                        <div className="text-xs text-muted-foreground">
                          {formatTokens(tool.tokens_in)} / {formatTokens(tool.tokens_out)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${Number(tool.cost || 0).toFixed(2)}
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
            <CardTitle className="flex items-center gap-2 text-base">
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
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        <div>${model.price_per_million_input} in</div>
                        <div>${model.price_per_million_output} out</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${Number(model.cost || 0).toFixed(2)}
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
            <CardTitle className="flex items-center gap-2 text-base">
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
                    to={`/projects/${project.id}`}
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
            <CardTitle className="flex items-center gap-2 text-base">
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
                      'flex items-center justify-between rounded-md border p-2',
                      org.is_current && 'border-primary/50 bg-primary/5'
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
            <CardTitle className="flex items-center gap-2 text-base">
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
                        <div className="text-xs text-muted-foreground">@{account.external_username}</div>
                      )}
                    </div>
                    <Badge variant={account.is_active ? 'default' : 'secondary'} className="text-xs">
                      {account.is_active ? 'Active' : 'Inactive'}
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
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest events from this team member</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/events?user_id=${member.user_id}`}>View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <EventsTable
            events={events}
            isLoading={eventsLoading}
            className="border-0 rounded-none"
          />
        </CardContent>
      </Card>
    </div>
  );
}

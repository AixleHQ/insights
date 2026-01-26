import { useMemo } from 'react';
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
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useMember, useMemberEvents, useMemberStats } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { EventsTable, type EventRow } from '@/components/events';
import { cn } from '@/lib/utils';

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

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Activity;
  trend?: { value: number; label: string };
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
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <TrendingUp className={cn('size-3', trend.value >= 0 ? 'text-emerald-500' : 'text-red-500')} />
            <span className={trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'}>
              {trend.value >= 0 ? '+' : ''}
              {trend.value}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
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

export function MemberProfile() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();

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
  const stats = statsData || {
    total_events: 0,
    total_cost: 0,
    events_today: 0,
    events_this_week: 0,
    events_this_month: 0,
    most_used_tool: null,
    tool_breakdown: [],
    daily_activity: [],
  };

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

      {/* Stats Grid */}
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
          title="Today's Activity"
          value={stats.events_today}
          subtitle="Events today"
          icon={TrendingUp}
        />
        <StatCard
          title="Most Used Tool"
          value={stats.most_used_tool || 'None'}
          subtitle="Primary tool"
          icon={Code2}
        />
      </div>

      {/* Tool Breakdown */}
      {stats.tool_breakdown && stats.tool_breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tool Usage</CardTitle>
            <CardDescription>Breakdown by AI coding tool</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.tool_breakdown.map((tool) => {
                const percentage = stats.total_events > 0
                  ? Math.round((tool.count / stats.total_events) * 100)
                  : 0;
                return (
                  <div key={tool.tool} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{tool.tool}</span>
                      <span className="text-muted-foreground">
                        {tool.count.toLocaleString()} events · ${Number(tool.cost || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary/70 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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

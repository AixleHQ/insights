import { Link } from 'react-router-dom';
import {
  Users,
  Building2,
  Activity,
  DollarSign,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatDistanceToNow } from '@/lib/utils';

interface PlatformStats {
  total_users: number;
  users_this_month: number;
  total_organizations: number;
  orgs_this_month: number;
  total_events: number;
  events_this_month: number;
  total_cost_usd: number;
  cost_this_month: number;
}

interface RecentActivity {
  id: string;
  type: 'user_created' | 'org_created' | 'high_risk_event' | 'threshold_exceeded';
  description: string;
  created_at: string;
}

function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  format = 'number',
  isLoading,
}: {
  title: string;
  value: number;
  subValue?: string;
  icon: React.ElementType;
  format?: 'number' | 'currency';
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">
              {format === 'currency' ? formatCurrency(value) : formatNumber(value)}
            </div>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminOverview() {
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<PlatformStats>('/admin/stats'),
  });

  const { data: recentActivity, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['admin', 'activity', 'recent'],
    queryFn: () => api.get<RecentActivity[]>('/admin/activity?limit=5'),
  });

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users || 0}
          subValue={`+${stats?.users_this_month || 0} this month`}
          icon={Users}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Organizations"
          value={stats?.total_organizations || 0}
          subValue={`+${stats?.orgs_this_month || 0} this month`}
          icon={Building2}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Total Events"
          value={stats?.total_events || 0}
          subValue={`${formatNumber(stats?.events_this_month || 0)} this month`}
          icon={Activity}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Platform Revenue"
          value={stats?.total_cost_usd || 0}
          subValue={`${formatCurrency(stats?.cost_this_month || 0)} this month`}
          icon={DollarSign}
          format="currency"
          isLoading={isLoadingStats}
        />
      </div>

      {/* Quick actions and activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/admin/users">
                <Users className="mr-2 size-4" />
                Manage Users
                <ArrowRight className="ml-auto size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/admin/organizations">
                <Building2 className="mr-2 size-4" />
                Manage Organizations
                <ArrowRight className="ml-auto size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/admin/activity">
                <Activity className="mr-2 size-4" />
                View Activity Log
                <ArrowRight className="ml-auto size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/admin/settings">
                <TrendingUp className="mr-2 size-4" />
                Platform Settings
                <ArrowRight className="ml-auto size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/activity">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : recentActivity?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity?.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div
                      className={`size-2 rounded-full ${
                        activity.type === 'high_risk_event' ||
                        activity.type === 'threshold_exceeded'
                          ? 'bg-destructive'
                          : 'bg-primary'
                      }`}
                    />
                    <span className="flex-1 truncate">{activity.description}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatDistanceToNow(activity.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Building2,
  Users,
  Activity,
  DollarSign,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow, formatCurrency } from '@/lib/utils';

interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  status: 'active' | 'suspended' | 'trial';
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

function StatusBadge({ status }: { status: AdminOrganization['status'] }) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'suspended':
      return <Badge variant="destructive">Suspended</Badge>;
    case 'trial':
      return <Badge variant="secondary">Trial</Badge>;
    default:
      return null;
  }
}

function PlanBadge({ plan }: { plan: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    enterprise: 'default',
    team: 'secondary',
    free: 'outline',
  };
  return (
    <Badge variant={variants[plan] || 'outline'} className="capitalize">
      {plan}
    </Badge>
  );
}

export function AdminOrganizations() {
  const [search, setSearch] = useState('');

  const { data: organizations, isLoading } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: () => api.get<AdminOrganization[]>('/admin/organizations'),
  });

  const filteredOrgs = useMemo(() => {
    if (!organizations) return [];
    if (!search) return organizations;

    const searchLower = search.toLowerCase();
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(searchLower) ||
        org.slug.toLowerCase().includes(searchLower)
    );
  }, [organizations, search]);

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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Organization</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[90px]">Plan</TableHead>
              <TableHead className="w-[80px]">Members</TableHead>
              <TableHead className="w-[100px]">Events</TableHead>
              <TableHead className="w-[100px]">Cost</TableHead>
              <TableHead className="w-[120px]">Created</TableHead>
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
                      {search ? 'No organizations found' : 'No organizations yet'}
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
                        {org.status === 'active' ? (
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

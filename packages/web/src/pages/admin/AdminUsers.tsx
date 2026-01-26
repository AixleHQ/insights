import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Shield, ShieldCheck, Mail, MoreVertical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { formatDistanceToNow } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  super_admin: boolean;
  created_at: string;
  last_active_at: string | null;
  organizations_count: number;
  events_count: number;
}

function UserSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
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

export function AdminUsers() {
  const [search, setSearch] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<AdminUser[]>('/admin/users'),
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!search) return users;

    const searchLower = search.toLowerCase();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(searchLower) ||
        user.name?.toLowerCase().includes(searchLower)
    );
  }, [users, search]);

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage all users across the platform
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Users className="size-3" />
          {users?.length || 0} users
        </Badge>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">User</TableHead>
              <TableHead className="w-[100px]">Role</TableHead>
              <TableHead className="w-[80px]">Orgs</TableHead>
              <TableHead className="w-[80px]">Events</TableHead>
              <TableHead className="w-[120px]">Joined</TableHead>
              <TableHead className="w-[120px]">Last Active</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => <UserSkeleton key={i} />)
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? 'No users found' : 'No users yet'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {user.name || user.email.split('@')[0]}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.super_admin ? (
                      <Badge variant="default" className="gap-1">
                        <ShieldCheck className="size-3" />
                        Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Shield className="size-3" />
                        User
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {user.organizations_count}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {user.events_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(user.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.last_active_at
                      ? formatDistanceToNow(user.last_active_at)
                      : 'Never'}
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
                          <Link to={`/admin/users/${user.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Mail className="mr-2 size-4" />
                          Send Email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          {user.super_admin ? 'Revoke Super Admin' : 'Make Super Admin'}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Disable Account
                        </DropdownMenuItem>
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

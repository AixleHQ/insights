import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  UserX,
  User,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/contexts/OrgContext";
import { useUnattributedEvents, useOrganizationMembers, queryKeys } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RiskBadge } from "@/components/dashboard";
import { formatDistanceToNow } from "@/lib/utils";

type UnattributedSortField = "tool_name" | "risk_level" | "cost_usd" | "created_at";

const riskLevelOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function EventSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-32" />
      </TableCell>
    </TableRow>
  );
}

export function UnattributedEvents() {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<UnattributedSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { data: events, isLoading, isFetching } = useUnattributedEvents(currentOrg?.id || "");
  const { data: members } = useOrganizationMembers(currentOrg?.id || "");

  const handleSort = (field: UnattributedSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredEvents = useMemo(() => {
    if (!events) return [];

    let result = [...events];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.toolName || "").toLowerCase().includes(searchLower) ||
          (e.model || "").toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "tool_name":
          comparison = (a.toolName || "").localeCompare(b.toolName || "");
          break;
        case "risk_level":
          comparison = (riskLevelOrder[a.riskLevel || "none"] || 0) - (riskLevelOrder[b.riskLevel || "none"] || 0);
          break;
        case "cost_usd":
          comparison = (Number(a.costUsd) || 0) - (Number(b.costUsd) || 0);
          break;
        case "created_at":
          comparison = new Date(a.occurredAt || a.createdAt || 0).getTime() - new Date(b.occurredAt || b.createdAt || 0).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [events, search, sortField, sortDirection]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.events.unattributed(currentOrg?.id || ""),
    });
  };

  const handleAssign = async () => {
    if (!currentOrg || !selectedEvent || !selectedUser) return;

    setIsAssigning(true);
    try {
      // In production, this would be a real API call to assign the event
      await api.patch(`/organizations/${currentOrg.id}/events/${selectedEvent}`, {
        user_id: selectedUser,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.unattributed(currentOrg.id),
      });
      setAssignDialogOpen(false);
      setSelectedEvent(null);
      setSelectedUser("");
    } catch (error) {
      console.error("Failed to assign event:", error);
    } finally {
      setIsAssigning(false);
    }
  };

  const openAssignDialog = (eventId: string) => {
    setSelectedEvent(eventId);
    setAssignDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 flex-1">
          <Button asChild variant="ghost" size="icon">
            <Link to="/events">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Unattributed Events</h1>
            <p className="text-sm text-muted-foreground">
              Events that couldn't be automatically attributed to a user
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="self-start sm:self-auto">
          <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex items-start gap-4 p-4">
          <HelpCircle className="size-5 mt-0.5 text-amber-500 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Why are events unattributed?
            </p>
            <p className="text-muted-foreground">
              Events become unattributed when they can't be matched to a user account.
              This usually happens when the user hasn't linked their tool account in DB90.
              Ask team members to link their accounts in Settings → Tool Accounts.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by tool or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="gap-1 self-start sm:self-auto">
          <UserX className="size-3" />
          {events?.length || 0} unattributed
        </Badge>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton
                  field="tool_name"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Tool
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Event Type</TableHead>
              <TableHead>
                <SortButton
                  field="risk_level"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Risk
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <SortButton
                  field="cost_usd"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Cost
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton
                  field="created_at"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Time
                </SortButton>
              </TableHead>
              <TableHead className="w-[100px] sm:w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <EventSkeleton key={i} />)
            ) : filteredEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <User className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? "No matching events found" : "All events are attributed"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{event.toolName || "Unknown"}</p>
                      {event.model && (
                        <p className="text-xs text-muted-foreground">{event.model}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs">
                      {event.eventType || "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RiskBadge level={event.riskLevel || "none"} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">
                    ${Number(event.costUsd ?? 0).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(event.occurredAt || event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAssignDialog(event.id)}
                    >
                      <User className="mr-2 size-3" />
                      Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Event to User</DialogTitle>
            <DialogDescription>
              Select a team member to attribute this event to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member" />
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.id} value={member.user_id}>
                    <div className="flex items-center gap-2">
                      <span>{member.user.name || member.user.email}</span>
                      {member.user.name && (
                        <span className="text-muted-foreground">
                          ({member.user.email})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedUser || isAssigning}>
              {isAssigning ? "Assigning..." : "Assign Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

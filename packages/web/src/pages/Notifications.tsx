import { Bell, Check, Trash2, AlertTriangle, Info, CheckCircle, Zap } from "lucide-react";
import { useNotifications, type Notification } from "@/contexts/NotificationsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const typeIcons = {
  alert: AlertTriangle,
  info: Info,
  success: CheckCircle,
  event: Zap,
};

const typeColors = {
  alert: "text-destructive",
  info: "text-primary",
  success: "text-success",
  event: "text-muted-foreground",
};

function NotificationItem({
  notification,
  onMarkAsRead,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}) {
  const Icon = typeIcons[notification.type] || Info;
  const colorClass = typeColors[notification.type] || "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 transition-colors",
        notification.read ? "bg-muted/30" : "bg-card"
      )}
    >
      <div className={cn("mt-0.5", colorClass)}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "type-label",
              notification.read ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {notification.title}
          </p>
          {!notification.read && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1"
              onClick={() => onMarkAsRead(notification.id)}
            >
              <Check className="size-4" />
              <span className="sr-only">Mark as read</span>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{notification.description}</p>
        <p className="text-xs text-muted-foreground/60">{notification.time}</p>
      </div>
    </div>
  );
}

export function Notifications() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-h2">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <Check className="mr-2 size-4" />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="mr-2 size-4" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Bell className="size-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2 text-lg">No notifications</CardTitle>
            <CardDescription>
              You're all caught up! New notifications will appear here.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="type-body-lg">Recent Activity</CardTitle>
            <CardDescription>
              Notifications from your organization's activity
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 p-4">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

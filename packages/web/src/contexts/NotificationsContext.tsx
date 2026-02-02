import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useOrg } from './OrgContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDistanceToNow, humanizeToolName } from '@/lib/utils';

export interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: 'alert' | 'info' | 'success' | 'event';
  timestamp: number;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}

const MAX_NOTIFICATIONS = 50;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useOrg();
  const storageKey = `db90_notifications_${currentOrg?.id}`;

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage
  useEffect(() => {
    if (currentOrg?.id) {
      localStorage.setItem(storageKey, JSON.stringify(notifications));
    }
  }, [notifications, storageKey, currentOrg?.id]);

  // Clear notifications when org changes
  useEffect(() => {
    if (currentOrg?.id) {
      try {
        const stored = localStorage.getItem(storageKey);
        setNotifications(stored ? JSON.parse(stored) : []);
      } catch {
        setNotifications([]);
      }
    }
  }, [currentOrg?.id, storageKey]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'time' | 'read' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: 'Just now',
      read: false,
      timestamp: Date.now(),
    };

    setNotifications((prev) => {
      const updated = [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS);
      return updated;
    });
  }, []);

  // Update relative times periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          time: formatDistanceToNow(new Date(n.timestamp).toISOString()),
        }))
      );
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Handle WebSocket events
  const handleNewEvent = useCallback((data: unknown) => {
    const event = data as { tool_name?: string; event_type?: string };
    addNotification({
      title: 'New Event',
      description: `${humanizeToolName(event.tool_name)}: ${event.event_type || 'event'}`,
      type: 'event',
    });
  }, [addNotification]);

  const handleAlert = useCallback((data: unknown) => {
    const alert = data as { alert?: { title?: string; description?: string } };
    addNotification({
      title: alert.alert?.title || 'Alert',
      description: alert.alert?.description || 'New alert received',
      type: 'alert',
    });
  }, [addNotification]);

  // Subscribe to WebSocket events
  // TODO: Re-enable when ActionCable authentication is properly configured
  useWebSocket({
    autoConnect: false, // Disabled until WebSocket auth is fixed
    onNewEvent: handleNewEvent,
    onAlert: handleAlert,
  });

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

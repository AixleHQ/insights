import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import {
  getWebSocketClient,
  connectWebSocket,
  disconnectWebSocket,
  type WebSocketMessage,
} from "@/lib/websocket";

export interface UseWebSocketOptions {
  /** Whether to auto-connect when the user is authenticated */
  autoConnect?: boolean;
  /** Callback for new events */
  onNewEvent?: (event: unknown) => void;
  /** Callback for event updates */
  onEventUpdated?: (event: unknown) => void;
  /** Callback for alerts */
  onAlert?: (alert: unknown) => void;
}

export interface UseWebSocketReturn {
  /** Whether currently connected to WebSocket */
  isConnected: boolean;
  /** Manually connect to WebSocket */
  connect: () => Promise<void>;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { autoConnect = true, onNewEvent, onEventUpdated, onAlert } = options;
  const { isAuthenticated } = useAuth();
  const { currentOrg } = useOrg();
  const [isConnected, setIsConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Memoize the message handler
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case "new_event":
          onNewEvent?.(message.data);
          break;
        case "event_updated":
          onEventUpdated?.(message.data);
          break;
        case "alert":
          onAlert?.(message.data);
          break;
        default:
          console.log("[useWebSocket] Unknown message type:", message.type);
      }
    },
    [onNewEvent, onEventUpdated, onAlert]
  );

  // Connect and subscribe when authenticated and org is selected
  useEffect(() => {
    if (!autoConnect || !isAuthenticated || !currentOrg) {
      return;
    }

    const setupConnection = async () => {
      try {
        await connectWebSocket();
        setIsConnected(true);

        // Subscribe to the organization's events channel
        const client = getWebSocketClient();
        unsubscribeRef.current = client.subscribe({
          channel: "EventsChannel",
          params: { organization_id: currentOrg.id },
          onMessage: handleMessage,
          onSubscribed: () => {
            console.log("[useWebSocket] Subscribed to EventsChannel");
          },
          onDisconnected: () => {
            setIsConnected(false);
          },
        });
      } catch (error) {
        console.error("[useWebSocket] Failed to connect:", error);
        setIsConnected(false);
      }
    };

    setupConnection();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [autoConnect, isAuthenticated, currentOrg, handleMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      await connectWebSocket();
      setIsConnected(true);
    } catch (error) {
      console.error("[useWebSocket] Failed to connect:", error);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectWebSocket();
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
  };
}

/**
 * Hook for subscribing to real-time events on the dashboard
 */
export function useDashboardEvents(options: {
  onNewEvent?: (event: unknown) => void;
  onAlert?: (alert: unknown) => void;
}) {
  return useWebSocket({
    autoConnect: true,
    onNewEvent: options.onNewEvent,
    onAlert: options.onAlert,
  });
}

/**
 * Hook for subscribing to real-time events on the events page
 */
export function useEventsPageUpdates(options: {
  onNewEvent?: (event: unknown) => void;
  onEventUpdated?: (event: unknown) => void;
}) {
  return useWebSocket({
    autoConnect: true,
    onNewEvent: options.onNewEvent,
    onEventUpdated: options.onEventUpdated,
  });
}

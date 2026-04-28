/**
 * WebSocket client for ActionCable (Rails WebSocket)
 *
 * This module provides a client for connecting to Rails ActionCable
 * with auto-reconnect and subscription management.
 */

import { getAccessToken } from "./auth";

export interface WebSocketMessage {
  type: "new_event" | "event_updated" | "alert" | "ping";
  data?: unknown;
}

export interface ChannelSubscription {
  channel: string;
  params?: Record<string, unknown>;
  onMessage: (message: WebSocketMessage) => void;
  onSubscribed?: () => void;
  onDisconnected?: () => void;
}

type ConnectionState = "disconnected" | "connecting" | "connected";

class ActionCableClient {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, ChannelSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private state: ConnectionState = "disconnected";
  private messageQueue: string[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async connect(): Promise<void> {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.state = "connecting";

    try {
      const token = await getAccessToken();
      const wsUrl = this.baseUrl.replace(/^http/, "ws");
      const url = `${wsUrl}/cable?token=${token}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[WebSocket] Connected");
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
        this.resubscribeAll();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error("[WebSocket] Failed to parse message:", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[WebSocket] Disconnected:", event.code, event.reason);
        this.state = "disconnected";
        this.stopPing();
        this.notifyDisconnected();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (error) {
      console.error("[WebSocket] Failed to connect:", error);
      this.state = "disconnected";
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.state = "disconnected";
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  subscribe(subscription: ChannelSubscription): () => void {
    const key = this.getSubscriptionKey(subscription.channel, subscription.params);
    this.subscriptions.set(key, subscription);

    if (this.state === "connected") {
      this.sendSubscribe(subscription);
    }

    return () => {
      this.unsubscribe(subscription.channel, subscription.params);
    };
  }

  unsubscribe(channel: string, params?: Record<string, unknown>): void {
    const key = this.getSubscriptionKey(channel, params);
    this.subscriptions.delete(key);

    if (this.state === "connected") {
      this.send({
        command: "unsubscribe",
        identifier: JSON.stringify({ channel, ...params }),
      });
    }
  }

  private getSubscriptionKey(channel: string, params?: Record<string, unknown>): string {
    return JSON.stringify({ channel, ...params });
  }

  private send(data: unknown): void {
    const message = JSON.stringify(data);
    if (this.state === "connected" && this.ws) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws && this.state === "connected") {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(message);
      }
    }
  }

  private sendSubscribe(subscription: ChannelSubscription): void {
    const identifier = JSON.stringify({
      channel: subscription.channel,
      ...subscription.params,
    });

    this.send({
      command: "subscribe",
      identifier,
    });
  }

  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      this.sendSubscribe(subscription);
    }
  }

  private handleMessage(data: {
    type?: string;
    identifier?: string;
    message?: WebSocketMessage;
  }): void {
    if (data.type === "ping") {
      // ActionCable ping, ignore
      return;
    }

    if (data.type === "welcome") {
      console.log("[WebSocket] Welcome received");
      return;
    }

    if (data.type === "confirm_subscription") {
      const identifier = data.identifier;
      if (identifier) {
        const subscription = this.subscriptions.get(identifier);
        if (subscription?.onSubscribed) {
          subscription.onSubscribed();
        }
      }
      return;
    }

    if (data.message && data.identifier) {
      const subscription = this.subscriptions.get(data.identifier);
      if (subscription) {
        subscription.onMessage(data.message);
      }
    }
  }

  private notifyDisconnected(): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.onDisconnected) {
        subscription.onDisconnected();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WebSocket] Max reconnect attempts reached");
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.state === "disconnected") {
        this.connect();
      }
    }, delay);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.state === "connected" && this.ws) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Singleton instance
let client: ActionCableClient | null = null;

export function getWebSocketClient(): ActionCableClient {
  if (!client) {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    client = new ActionCableClient(baseUrl);
  }
  return client;
}

export function connectWebSocket(): Promise<void> {
  return getWebSocketClient().connect();
}

export function disconnectWebSocket(): void {
  if (client) {
    client.disconnect();
  }
}

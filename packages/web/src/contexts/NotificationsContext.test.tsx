import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";

// Mock OrgContext
vi.mock("./OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    memberships: [],
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
    isLoading: false,
    currentRole: "owner",
  }),
}));

// Mock useWebSocket
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    isConnected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

describe("NotificationsContext", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("should start with empty notifications", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("should mark notification as read", () => {
    // Pre-populate localStorage with a notification
    localStorageMock.setItem(
      "db90_notifications_test-org-id",
      JSON.stringify([
        {
          id: "1",
          title: "Test",
          description: "Test notification",
          time: "Just now",
          read: false,
          type: "info",
          timestamp: Date.now(),
        },
      ])
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAsRead("1");
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].read).toBe(true);
  });

  it("should mark all notifications as read", () => {
    localStorageMock.setItem(
      "db90_notifications_test-org-id",
      JSON.stringify([
        {
          id: "1",
          title: "Test 1",
          description: "Test notification 1",
          time: "Just now",
          read: false,
          type: "info",
          timestamp: Date.now(),
        },
        {
          id: "2",
          title: "Test 2",
          description: "Test notification 2",
          time: "Just now",
          read: false,
          type: "alert",
          timestamp: Date.now(),
        },
      ])
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.unreadCount).toBe(2);

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });

  it("should clear all notifications", () => {
    localStorageMock.setItem(
      "db90_notifications_test-org-id",
      JSON.stringify([
        {
          id: "1",
          title: "Test",
          description: "Test notification",
          time: "Just now",
          read: false,
          type: "info",
          timestamp: Date.now(),
        },
      ])
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications.length).toBe(1);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications.length).toBe(0);
  });
});

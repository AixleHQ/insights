import { useState, useEffect, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";

export interface OverviewStats {
  total_events: number;
  total_cost_usd: number;
  active_alerts: number;
  active_users: number;
  events_change_percent?: number;
  cost_change_percent?: number;
}

export interface DailyStats {
  date: string;
  cost: number;
  events: number;
}

export interface ToolStats {
  tool_name: string;
  event_count: number;
  total_cost: number;
}

export interface UseStatsReturn {
  overview: OverviewStats | null;
  daily: DailyStats[];
  tools: ToolStats[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useStats(): UseStatsReturn {
  const { currentOrg } = useOrg();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [tools, setTools] = useState<ToolStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    if (!currentOrg) return;

    setIsLoading(true);
    setError(null);

    try {
      // In production, these would be parallel API calls
      // const [overviewRes, dailyRes, toolsRes] = await Promise.all([
      //   api.get<OverviewStats>(`/organizations/${currentOrg.id}/stats/overview`),
      //   api.get<DailyStats[]>(`/organizations/${currentOrg.id}/stats/daily?days=30`),
      //   api.get<ToolStats[]>(`/organizations/${currentOrg.id}/stats/tools`),
      // ]);

      // Mock data for development
      await new Promise((resolve) => setTimeout(resolve, 300));

      setOverview({
        total_events: 12456,
        total_cost_usd: 1234.56,
        active_alerts: 3,
        active_users: 24,
        events_change_percent: 12.5,
        cost_change_percent: -5.2,
      });

      // Generate 30 days of mock data
      const mockDaily: DailyStats[] = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return {
          date: date.toISOString().split("T")[0],
          cost: Math.random() * 100 + 20,
          events: Math.floor(Math.random() * 500 + 100),
        };
      });
      setDaily(mockDaily);

      setTools([
        { tool_name: "GitHub Copilot", event_count: 2340, total_cost: 156.8 },
        { tool_name: "Claude Code", event_count: 1890, total_cost: 234.5 },
        { tool_name: "Cursor", event_count: 1245, total_cost: 89.2 },
        { tool_name: "Aider", event_count: 567, total_cost: 45.6 },
        { tool_name: "Codeium", event_count: 234, total_cost: 12.3 },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch stats"));
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    overview,
    daily,
    tools,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

export function useEventStats(days: number = 7) {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchStats = async () => {
      setIsLoading(true);
      try {
        // Mock data
        await new Promise((resolve) => setTimeout(resolve, 200));
        const mockData: DailyStats[] = Array.from({ length: days }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (days - 1 - i));
          return {
            date: date.toISOString().split("T")[0],
            cost: Math.random() * 100 + 20,
            events: Math.floor(Math.random() * 500 + 100),
          };
        });
        setStats(mockData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch stats"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [currentOrg, days]);

  return { stats, isLoading, error };
}

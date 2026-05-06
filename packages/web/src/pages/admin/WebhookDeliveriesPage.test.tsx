import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { render } from "@/test/utils";
import { WebhookDeliveriesPage } from "./WebhookDeliveriesPage";

const mockUseWebhookDeliveries = vi.fn();
const mockUseRetryWebhookDelivery = vi.fn();
const mockUseOrganization = vi.fn();

vi.mock("@/api/webhookDeliveries", () => ({
  useWebhookDeliveries: (...args: unknown[]) => mockUseWebhookDeliveries(...args),
  useRetryWebhookDelivery: (...args: unknown[]) => mockUseRetryWebhookDelivery(...args),
}));

vi.mock("@/hooks/useApi", () => ({
  useOrganization: (...args: unknown[]) => mockUseOrganization(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ organizationId: "org-test-1" }),
    useSearchParams: () => {
      const params = new URLSearchParams("");
      return [
        params,
        vi.fn(),
      ] as const;
    },
  };
});

const deliveredRow = {
  id: "wd-1",
  organizationConnectorId: "c1",
  provider: "github" as const,
  eventType: "push",
  rawEventKey: "k1",
  status: "delivered" as const,
  attempts: 1,
  lastAttemptedAt: "2026-01-01T12:00:00Z",
  lastError: null,
  deliveredAt: "2026-01-01T12:00:01Z",
  createdAt: "2026-01-01T11:59:00Z",
  updatedAt: "2026-01-01T12:00:01Z",
};

const failedRecentRow = {
  ...deliveredRow,
  id: "wd-fail-recent",
  status: "failed" as const,
  lastError: "boom",
  deliveredAt: null,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

const failedOldRow = {
  ...failedRecentRow,
  id: "wd-fail-old",
  createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
};

describe("WebhookDeliveriesPage", () => {
  let retryMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    retryMutate = vi.fn();
    mockUseOrganization.mockReturnValue({
      data: { id: "org-test-1", name: "Acme", slug: "acme" },
      isLoading: false,
    });
    mockUseWebhookDeliveries.mockReturnValue({
      data: {
        data: [deliveredRow, failedRecentRow, failedOldRow],
        meta: { current_page: 1, total_pages: 1, total_count: 3, per_page: 25 },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    mockUseRetryWebhookDelivery.mockReturnValue({
      mutate: retryMutate,
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders rows and enables retry only for recent failed deliveries", async () => {
    const user = userEvent.setup();
    render(<WebhookDeliveriesPage />);

    expect(screen.getByRole("heading", { name: /webhook deliveries/i })).toBeInTheDocument();
    expect(screen.getAllByText("github").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0);

    const retryButtons = screen.getAllByRole("button", { name: /retry/i });
    expect(retryButtons).toHaveLength(2);
    const enabledRetry = retryButtons.find((b) => !b.hasAttribute("disabled"));
    expect(enabledRetry).toBeDefined();

    await user.click(enabledRetry!);
    expect(retryMutate).toHaveBeenCalledWith("wd-fail-recent", expect.any(Object));
  });

  it("surfaces list errors", () => {
    mockUseWebhookDeliveries.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error("network down"),
    });

    render(<WebhookDeliveriesPage />);

    expect(screen.getByText(/could not load data/i)).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });
});

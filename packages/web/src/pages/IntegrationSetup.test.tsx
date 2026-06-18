import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntegrationSetup } from "./IntegrationSetup";

// --- Mock dependencies ---

const mockCreateConnector = vi.fn();
const mockUpdateConnector = vi.fn();

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "org-1", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useProjects: () => ({ data: [{ id: "proj-1", name: "Project Alpha" }] }),
  useCreateConnector: () => ({ mutateAsync: mockCreateConnector }),
  useUpdateConnector: () => ({ mutateAsync: mockUpdateConnector }),
}));

vi.mock("@/components/icons", () => ({
  ProviderLogo: () => <div data-testid="provider-logo" />,
}));

// --- Test setup ---

function renderSetup(provider = "github") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/integrations/setup/${provider}`]}>
        <Routes>
          <Route path="/integrations/setup/:provider" element={<IntegrationSetup />} />
          <Route path="/integrations" element={<div>Integrations page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Advance component to the configure step by simulating the OAuth callback message. */
async function advanceToConfigureStep(connectorId = "conn-42") {
  // Overview → Authorize
  await userEvent.click(screen.getByRole("button", { name: /continue/i }));
  // Simulate OAuth callback message — component listens with window.addEventListener
  await act(async () => {
    mockCreateConnector.mockResolvedValueOnce({
      data: {
        id: connectorId,
        connectorType: "github",
        isActive: true,
        status: "connected",
        scope: "project",
        syncRepositories: true,
        syncPullRequests: true,
        webhookEnabled: false,
        linkedProjectId: null,
      },
    });
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "integration_oauth_callback", code: "oauth-code-abc" },
      })
    );
  });
}

// --- Tests ---

describe("IntegrationSetup — configure step (step 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateConnector.mockResolvedValue({ data: { id: "conn-42" } });
  });

  it("renders Sync Options and Link to Project for github (source-control)", async () => {
    renderSetup("github");
    await advanceToConfigureStep();

    expect(screen.getByText("Sync Repositories")).toBeInTheDocument();
    expect(screen.getByText("Sync Pull Requests / MRs")).toBeInTheDocument();
    expect(screen.getByText("Enable Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Link to Project")).toBeInTheDocument();
  });

  it("does NOT render Sync Options for non-source-control providers (jira)", async () => {
    renderSetup("jira");
    // Jira goes through OAuth too
    await act(async () => {
      mockCreateConnector.mockResolvedValueOnce({
        data: { id: "conn-jira", connectorType: "jira", isActive: true, status: "connected", scope: "org" },
      });
    });
    // Click through to configure
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "integration_oauth_callback", code: "code" },
        })
      );
    });

    expect(screen.queryByText("Sync Repositories")).not.toBeInTheDocument();
    expect(screen.queryByText("Link to Project")).not.toBeInTheDocument();
  });

  it("does NOT show Connection Name field", async () => {
    renderSetup("github");
    await advanceToConfigureStep();

    expect(screen.queryByLabelText(/connection name/i)).not.toBeInTheDocument();
  });

  it("clicking Connect calls updateConnector with mapped payload", async () => {
    renderSetup("github");
    await advanceToConfigureStep("conn-42");

    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(mockUpdateConnector).toHaveBeenCalledWith({
      orgId: "org-1",
      connectorId: "conn-42",
      data: {
        config: {
          sync_repositories: true,
          sync_pull_requests: true,
          webhook_enabled: false,
          // selectedProject is "" so linked_project_id is omitted
        },
      },
    });
  });

  it("advances to complete only when updateConnector succeeds", async () => {
    renderSetup("github");
    await advanceToConfigureStep();

    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(screen.getByText("Connection Successful!")).toBeInTheDocument();
  });

  it("stays on configure and shows error when updateConnector fails", async () => {
    mockUpdateConnector.mockRejectedValueOnce(new Error("Network error"));

    renderSetup("github");
    await advanceToConfigureStep();

    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(screen.getByText(/failed to complete setup/i)).toBeInTheDocument();
    expect(screen.queryByText("Connection Successful!")).not.toBeInTheDocument();
  });

  it("includes linked_project_id in payload when a project is selected", async () => {
    renderSetup("github");
    await advanceToConfigureStep("conn-42");

    // Open and select a project
    fireEvent.click(screen.getByRole("combobox"));
    const option = await screen.findByText("Project Alpha");
    fireEvent.click(option);

    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    const call = mockUpdateConnector.mock.calls[0][0];
    expect(call.data.config.linked_project_id).toBe("proj-1");
  });

  it("does NOT call updateConnector for non-source-control providers", async () => {
    renderSetup("jira");

    await act(async () => {
      mockCreateConnector.mockResolvedValueOnce({
        data: { id: "conn-jira", connectorType: "jira", isActive: true, status: "connected", scope: "org" },
      });
    });

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "integration_oauth_callback", code: "code" },
        })
      );
    });

    await userEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(mockUpdateConnector).not.toHaveBeenCalled();
    expect(screen.getByText("Connection Successful!")).toBeInTheDocument();
  });
});

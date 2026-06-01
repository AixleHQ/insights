import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectMembersTab } from "./ProjectMembersTab";
import {
  useProjectMembers,
  useProjectMemberStats,
  useAddProjectMember,
  useRemoveProjectMember,
  useOrganizationMembers,
} from "@/hooks/useApi";

vi.mock("@/hooks/useApi", () => ({
  useProjectMembers: vi.fn(),
  useProjectMemberStats: vi.fn(),
  useAddProjectMember: vi.fn(),
  useRemoveProjectMember: vi.fn(),
  useOrganizationMembers: vi.fn(),
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockRemoveMutate = vi.fn();
const mockAddMutate = vi.fn();

const mockMembers = [
  { id: "m1", userId: "user-1", email: "alice@example.com", name: "Alice Johnson", avatarUrl: null, role: "owner", joinedAt: "2024-01-01T00:00:00Z", totalEvents: 0, totalCost: 0, lastActiveAt: null, cliConnected: true },
  { id: "m2", userId: "user-2", email: "bob@example.com", name: "Bob Smith", avatarUrl: null, role: "member", joinedAt: "2024-01-01T00:00:00Z", totalEvents: 0, totalCost: 0, lastActiveAt: null, cliConnected: false },
];

const mockStats = [
  { userId: "user-1", email: "alice@example.com", name: "Alice Johnson", role: "owner",
    eventCount: 42, inputTokens: 1500, outputTokens: 3000, costUsd: 0.05, lastEventAt: "2026-03-20T10:00:00Z", primaryTool: "claude_code" },
  { userId: "user-2", email: "bob@example.com", name: "Bob Smith", role: "member",
    eventCount: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, lastEventAt: null, primaryTool: null },
];

function setupDefaultMocks() {
  vi.mocked(useProjectMembers).mockReturnValue({ data: mockMembers } as ReturnType<typeof useProjectMembers>);
  vi.mocked(useProjectMemberStats).mockReturnValue({ data: undefined } as ReturnType<typeof useProjectMemberStats>);
  vi.mocked(useAddProjectMember).mockReturnValue({ mutate: mockAddMutate, isPending: false } as unknown as ReturnType<typeof useAddProjectMember>);
  vi.mocked(useRemoveProjectMember).mockReturnValue({ mutate: mockRemoveMutate } as unknown as ReturnType<typeof useRemoveProjectMember>);
  vi.mocked(useOrganizationMembers).mockReturnValue({ data: [] } as ReturnType<typeof useOrganizationMembers>);
}

describe("ProjectMembersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe("member view (isProjectOwner=false)", () => {
    it("shows Name, Email, Role columns but not token/cost columns", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={false}
          canManageMembers={false}
        />
      );

      expect(screen.getByText("Member")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Role")).toBeInTheDocument();
      expect(screen.queryByText("Tokens In")).not.toBeInTheDocument();
      expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    });

    it("renders all member rows", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={false}
          canManageMembers={false}
        />
      );

      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });
  });

  describe("owner view (isProjectOwner=true)", () => {
    beforeEach(() => {
      vi.mocked(useProjectMemberStats).mockReturnValue({ data: mockStats } as ReturnType<typeof useProjectMemberStats>);
    });

    it("shows stats columns including CLI", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.getByText("CLI")).toBeInTheDocument();
      expect(screen.getByText("Tokens In")).toBeInTheDocument();
      expect(screen.getByText("Tokens Out")).toBeInTheDocument();
      expect(screen.getByText("Events")).toBeInTheDocument();
      expect(screen.getByText("Cost")).toBeInTheDocument();
      expect(screen.getByText("Last Active")).toBeInTheDocument();
    });

    it("shows Connected badge for cliConnected=true members", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("shows Not set up badge for cliConnected=false members", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.getByText("Not set up")).toBeInTheDocument();
    });

    it("renders no CLI badge when cliConnected is absent", () => {
      vi.mocked(useProjectMembers).mockReturnValue({
        data: [{ id: "m3", userId: "user-3", email: "carol@example.com", name: "Carol", avatarUrl: null, role: "member", joinedAt: "2024-01-01T00:00:00Z", totalEvents: 0, totalCost: 0, lastActiveAt: null }],
      } as ReturnType<typeof useProjectMembers>);

      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
      expect(screen.queryByText("Not set up")).not.toBeInTheDocument();
    });

    it("shows search input", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.getByPlaceholderText("Search members…")).toBeInTheDocument();
    });

    it("filters members by name when searching", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      fireEvent.change(screen.getByPlaceholderText("Search members…"), {
        target: { value: "alice" },
      });

      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
    });

    it("does not show Add Member button when canManageMembers=false", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      expect(screen.queryByText("Add Member")).not.toBeInTheDocument();
    });

    it("keeps projectId in member profile navigation", async () => {
      const user = userEvent.setup();

      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={false}
        />
      );

      await user.click(screen.getByText("Alice Johnson"));

      expect(mockNavigate).toHaveBeenCalledWith("/members/user-1?projectId=proj-1");
    });
  });

  describe("manager view (canManageMembers=true)", () => {
    beforeEach(() => {
      vi.mocked(useProjectMemberStats).mockReturnValue({ data: mockStats } as ReturnType<typeof useProjectMemberStats>);
    });

    it("shows Add Member button", () => {
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={true}
        />
      );

      expect(screen.getByText("Add Member")).toBeInTheDocument();
    });

    it("lists org members when API only provides user.id (not top-level userId)", async () => {
      const user = userEvent.setup();
      vi.mocked(useOrganizationMembers).mockReturnValue({
        data: [
          {
            id: "om-3",
            organization_id: "org-1",
            role: "member",
            user: {
              id: "user-ana",
              email: "edsger.dijkstra@example.com",
              name: "Edsger Dijkstra",
            },
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
      } as ReturnType<typeof useOrganizationMembers>);

      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={true}
        />
      );

      await user.click(screen.getByText("Add Member"));
      const [memberSelect] = screen.getAllByRole("combobox");
      await user.click(memberSelect);
      expect(await screen.findByRole("option", { name: "Edsger Dijkstra" })).toBeInTheDocument();
    });

    it("calls remove mutation when Remove from project is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ProjectMembersTab
          projectId="proj-1"
          orgId="org-1"
          isProjectOwner={true}
          canManageMembers={true}
        />
      );

      // The action icon buttons have no accessible name — select by role "button" with aria-haspopup
      const actionTriggers = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-haspopup") === "menu");
      expect(actionTriggers.length).toBeGreaterThan(0);
      await user.click(actionTriggers[0]);

      const removeItem = await screen.findByText("Remove from project");
      await user.click(removeItem);

      expect(mockRemoveMutate).toHaveBeenCalledWith("m1");
    });
  });
});

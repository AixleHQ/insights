import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@/test/utils";
import { ProjectTeamSection } from "./ProjectTeamSection";
import type { ProjectMember } from "@/hooks/useApi";

// Radix UI Select requires these in jsdom
beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mockUpdateMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockAddMutate = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useUpdateProjectMember: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useRemoveProjectMember: () => ({ mutate: mockRemoveMutate, isPending: false }),
  useAddProjectMember: () => ({ mutate: mockAddMutate, isPending: false }),
  useOrganizationMembers: () => ({ data: [] }),
}));

const mockMembers: ProjectMember[] = [
  {
    id: "1",
    userId: "user-1",
    email: "alice@example.com",
    name: "Alice Johnson",
    avatarUrl: "https://example.com/avatar1.jpg",
    role: "owner",
    joinedAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "2",
    userId: "user-2",
    email: "bob@example.com",
    name: null,
    avatarUrl: null,
    role: "member",
    joinedAt: "2024-01-20T10:00:00Z",
  },
];

const renderComponent = (props: Partial<Parameters<typeof ProjectTeamSection>[0]> = {}) => {
  return render(<ProjectTeamSection members={mockMembers} {...props} />);
};

describe("ProjectTeamSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial Render", () => {
    it("renders the component with title", () => {
      renderComponent();
      expect(screen.getByText("Team")).toBeInTheDocument();
    });

    it("displays member count correctly", () => {
      renderComponent();
      expect(screen.getByText("2 members")).toBeInTheDocument();
    });

    it("displays singular member text for single member", () => {
      renderComponent({ members: [mockMembers[0]] });
      expect(screen.getByText("1 member")).toBeInTheDocument();
    });
  });

  describe("Member Display (read-only)", () => {
    it("renders member names", () => {
      renderComponent();
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    });

    it("falls back to email prefix when name is null", () => {
      renderComponent();
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    it("displays role badges", () => {
      renderComponent();
      expect(screen.getByText("owner")).toBeInTheDocument();
      expect(screen.getByText("member")).toBeInTheDocument();
    });

    it("renders links to member profiles", () => {
      renderComponent();
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(2);
      expect(links[0]).toHaveAttribute("href", "/members/user-1");
      expect(links[1]).toHaveAttribute("href", "/members/user-2");
    });

    it("appends projectId query param to links when projectId is provided", () => {
      renderComponent({ projectId: "proj-abc" });
      const links = screen.getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", "/members/user-1?projectId=proj-abc");
      expect(links[1]).toHaveAttribute("href", "/members/user-2?projectId=proj-abc");
    });

    it("does not append projectId when prop is omitted", () => {
      renderComponent();
      const links = screen.getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", "/members/user-1");
      expect(links[1]).toHaveAttribute("href", "/members/user-2");
    });
  });

  describe("Avatar Display", () => {
    it("renders fallback initials when name is provided", () => {
      renderComponent();
      expect(screen.getByText("AJ")).toBeInTheDocument();
    });

    it("renders fallback initials from email when name is null", () => {
      renderComponent();
      expect(screen.getByText("BO")).toBeInTheDocument();
    });

    it("has avatar container for each member", () => {
      const { container } = renderComponent();
      const avatars = container.querySelectorAll('[data-slot="avatar"]');
      expect(avatars.length).toBe(2);
    });
  });

  describe("Loading State", () => {
    it("shows loading text when isLoading is true", () => {
      renderComponent({ isLoading: true });
      expect(screen.getByText("Loading team members…")).toBeInTheDocument();
    });

    it("shows skeleton loaders when loading", () => {
      const { container } = renderComponent({ isLoading: true });
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Empty State", () => {
    it("shows empty message when no members", () => {
      renderComponent({ members: [] });
      expect(screen.getByText("No explicit project members.")).toBeInTheDocument();
      expect(
        screen.getByText(/Organization owners always have implicit access/)
      ).toBeInTheDocument();
    });

    it("shows empty message when members is undefined", () => {
      renderComponent({ members: undefined });
      expect(screen.getByText("No explicit project members.")).toBeInTheDocument();
    });

    it("displays 0 members count", () => {
      renderComponent({ members: [] });
      expect(screen.getByText("0 members")).toBeInTheDocument();
    });
  });

  describe("Role Badge Colors", () => {
    it("applies shared role badge for owner role", () => {
      const { container } = renderComponent({ members: [mockMembers[0]] });
      expect(screen.getByText("owner")).toBeInTheDocument();
      expect(container.querySelector(".lucide-crown")).toBeInTheDocument();
    });

    it("applies shared role badge for member role", () => {
      const { container } = renderComponent({ members: [mockMembers[1]] });
      expect(screen.getByText("member")).toBeInTheDocument();
      expect(container.querySelector(".lucide-user")).toBeInTheDocument();
    });

    it("handles viewer role", () => {
      const viewerMember: ProjectMember = {
        ...mockMembers[0],
        id: "4",
        role: "viewer",
      };
      renderComponent({ members: [viewerMember] });
      expect(screen.getByText("viewer")).toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("applies custom className to container", () => {
      const { container } = renderComponent({ className: "custom-class" });
      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("canManage mode", () => {
    const manageProps = { canManage: true, projectId: "proj-1", orgId: "org-1" };

    it("does not show link cards when canManage is true", () => {
      renderComponent(manageProps);
      expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("shows remove button for each member", () => {
      renderComponent(manageProps);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(mockMembers.length);
    });

    it("shows role selects for each member", () => {
      renderComponent(manageProps);
      const combos = screen.getAllByRole("combobox");
      expect(combos.length).toBe(mockMembers.length);
    });

    it("calls removeMember mutate when remove button is clicked", async () => {
      const { default: userEvent } = await import("@testing-library/user-event");
      const user = userEvent.setup();
      renderComponent(manageProps);

      const removeButtons = screen.getAllByRole("button");
      await user.click(removeButtons[0]);

      expect(mockRemoveMutate).toHaveBeenCalledWith(mockMembers[0].id);
    });
  });
});

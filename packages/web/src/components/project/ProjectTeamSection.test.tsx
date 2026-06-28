import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ProjectTeamSection } from "./ProjectTeamSection";
import type { ProjectMember } from "@/hooks/useApi";

vi.mock("@/hooks/useApi", () => ({
  useProjectMemberStats: () => ({ data: undefined }),
}));

const mockMembers: ProjectMember[] = [
  {
    id: "1",
    userId: "user-1",
    email: "alice@example.com",
    name: "Alice Johnson",
    avatarUrl: null,
    role: "owner",
    joinedAt: "2024-01-15T10:00:00Z",
    totalEvents: 42,
    totalCost: 12.5,
    lastActiveAt: null,
    cliConnected: true,
  },
  {
    id: "2",
    userId: "user-2",
    email: "bob@example.com",
    name: "Bob Smith",
    avatarUrl: null,
    role: "member",
    joinedAt: "2024-01-20T10:00:00Z",
    totalEvents: 10,
    totalCost: 3.0,
    lastActiveAt: null,
    cliConnected: false,
  },
];

describe("ProjectTeamSection", () => {
  it("renders Leaderboard heading", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
  });

  it("shows top contributors by spend subtitle", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    expect(screen.getByText("Top contributors by spend")).toBeInTheDocument();
  });

  it("renders member names sorted by cost descending", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    const items = screen.getAllByRole("link");
    expect(items[0]).toHaveTextContent("Alice Johnson");
    expect(items[1]).toHaveTextContent("Bob Smith");
  });

  it("shows rank numbers", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows cost values", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument();
  });

  it("shows event counts", () => {
    render(<ProjectTeamSection members={mockMembers} />);
    expect(screen.getByText("42 events")).toBeInTheDocument();
    expect(screen.getByText("10 events")).toBeInTheDocument();
  });

  it("shows empty state when no members", () => {
    render(<ProjectTeamSection members={[]} />);
    expect(screen.getByText("No members yet.")).toBeInTheDocument();
  });

  it("renders loading skeletons when isLoading", () => {
    render(<ProjectTeamSection members={undefined} isLoading />);
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
  });

  it("limits display to top 5", () => {
    const manyMembers: ProjectMember[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      userId: `user-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      avatarUrl: null,
      role: "member",
      joinedAt: "2024-01-01T00:00:00Z",
      totalEvents: i,
      totalCost: i * 1.0,
      lastActiveAt: null,
      cliConnected: false,
    }));
    render(<ProjectTeamSection members={manyMembers} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

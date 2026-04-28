import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ToolUsersTable } from "./ToolUsersTable";
import type { ToolUserStat } from "@/lib/types";

const mockUsers: ToolUserStat[] = [
  {
    userId: "user-1",
    name: "Alice Smith",
    email: "alice@example.com",
    eventCount: 320,
    totalTokens: 95000,
    costUsd: 1.14,
  },
  {
    userId: "user-2",
    name: "Bob Jones",
    email: "bob@example.com",
    eventCount: 150,
    totalTokens: 42000,
    costUsd: 0.52,
  },
];

describe("ToolUsersTable", () => {
  it("shows skeleton rows while loading", () => {
    render(<ToolUsersTable users={[]} isLoading={true} />);
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.queryByText("No user data")).not.toBeInTheDocument();
  });

  it("shows empty state when no users", () => {
    render(<ToolUsersTable users={[]} isLoading={false} />);
    expect(screen.getByText("No user data for this period.")).toBeInTheDocument();
  });

  it("renders user names and emails", () => {
    render(<ToolUsersTable users={mockUsers} isLoading={false} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("renders event counts", () => {
    render(<ToolUsersTable users={mockUsers} isLoading={false} />);
    expect(screen.getByText("320")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("renders token totals in compact form", () => {
    render(<ToolUsersTable users={mockUsers} isLoading={false} />);
    expect(screen.getByText("95.0K")).toBeInTheDocument();
    expect(screen.getByText("42.0K")).toBeInTheDocument();
  });

  it("links user names to /members/:userId", () => {
    render(<ToolUsersTable users={mockUsers} isLoading={false} />);
    const aliceLink = screen.getByRole("link", { name: "Alice Smith" });
    expect(aliceLink).toHaveAttribute("href", "/members/user-1");

    const bobLink = screen.getByRole("link", { name: "Bob Jones" });
    expect(bobLink).toHaveAttribute("href", "/members/user-2");
  });
});

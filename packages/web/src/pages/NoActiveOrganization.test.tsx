import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NoActiveOrganization from "./NoActiveOrganization";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const mockRefreshOrganizations = vi.fn();
const mockSetCurrentOrg = vi.fn();
vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    refreshOrganizations: mockRefreshOrganizations,
    setCurrentOrg: mockSetCurrentOrg,
  }),
}));

const mockMutateAsync = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useCreateOrganization: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <NoActiveOrganization />
    </MemoryRouter>
  );
}

describe("NoActiveOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and message", () => {
    renderPage();
    expect(screen.getByText("No active organization")).toBeInTheDocument();
    expect(screen.getByText(/inactive or unavailable/i)).toBeInTheDocument();
  });

  it("renders Create organization button and Log out button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /create organization/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("calls logout when Log out is clicked", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it("creates org and navigates to dashboard on successful submission", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-org-id", name: "My New Org", slug: "my-new-org" });
    mockRefreshOrganizations.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "My New Org" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create organization/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ name: "My New Org", description: "" }));
    await waitFor(() => expect(mockRefreshOrganizations).toHaveBeenCalledWith("new-org-id"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("shows error message when create org fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Network error"));

    renderPage();
    fireEvent.change(screen.getByLabelText(/organization name/i), {
      target: { value: "Org" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create organization/i }));

    await waitFor(() =>
      expect(screen.getByText(/failed to create organization/i)).toBeInTheDocument()
    );
  });
});

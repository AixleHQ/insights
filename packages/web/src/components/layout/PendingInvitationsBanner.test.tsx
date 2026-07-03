import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PendingInvitationsBanner } from "./PendingInvitationsBanner";

beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mockUseCheckPendingInvitations = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCheckPendingInvitations: () => mockUseCheckPendingInvitations(),
}));

function renderBanner() {
  return render(
    <MemoryRouter>
      <PendingInvitationsBanner />
    </MemoryRouter>
  );
}

describe("PendingInvitationsBanner", () => {
  it("renders nothing when there are no pending invitations", () => {
    mockUseCheckPendingInvitations.mockReturnValue({ data: [] });

    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    mockUseCheckPendingInvitations.mockReturnValue({ data: undefined });

    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the organization name and a link to the invitation", () => {
    mockUseCheckPendingInvitations.mockReturnValue({
      data: [
        {
          id: "inv-1",
          token: "tok-123",
          role: "viewer",
          status: "pending",
          organization: { id: "org-1", name: "Acme Corp", slug: "acme-corp" },
          invitedByName: "Jane Doe",
          expired: false,
          expiresAt: new Date().toISOString(),
        },
      ],
    });

    renderBanner();

    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view invitation/i });
    expect(link).toHaveAttribute("href", "/invitations/tok-123");
  });

  it("lets the user reach every pending invitation when there are several", async () => {
    const user = userEvent.setup();
    mockUseCheckPendingInvitations.mockReturnValue({
      data: [
        {
          id: "inv-1",
          token: "tok-123",
          role: "viewer",
          status: "pending",
          organization: { id: "org-1", name: "Acme Corp", slug: "acme-corp" },
          invitedByName: "Jane Doe",
          expired: false,
          expiresAt: new Date().toISOString(),
        },
        {
          id: "inv-2",
          token: "tok-456",
          role: "member",
          status: "pending",
          organization: { id: "org-2", name: "Beta Inc", slug: "beta-inc" },
          invitedByName: "Jane Doe",
          expired: false,
          expiresAt: new Date().toISOString(),
        },
      ],
    });

    renderBanner();
    expect(screen.getByText(/2 pending invitations/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /view invitations/i }));

    const acmeLink = await screen.findByRole("menuitem", { name: "Acme Corp" });
    const betaLink = screen.getByRole("menuitem", { name: "Beta Inc" });
    expect(acmeLink).toHaveAttribute("href", "/invitations/tok-123");
    expect(betaLink).toHaveAttribute("href", "/invitations/tok-456");
  });
});

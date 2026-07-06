import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthCallback } from "./AuthCallback";

const mockLoginCallback = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../lib/auth", () => ({
  loginCallback: () => mockLoginCallback(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("AuthCallback", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLoginCallback.mockReset();
  });

  it("navigates to the OIDC state destination when it is a safe relative path", async () => {
    mockLoginCallback.mockResolvedValue({ state: "/invitations/tok-123" });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/invitations/tok-123", { replace: true });
    });
  });

  it("falls back to the dashboard when state is missing", async () => {
    mockLoginCallback.mockResolvedValue({ state: undefined });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("falls back to the dashboard when state is a protocol-relative path", async () => {
    mockLoginCallback.mockResolvedValue({ state: "//evil.com" });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("falls back to the dashboard when state is an absolute URL", async () => {
    mockLoginCallback.mockResolvedValue({ state: "http://evil.com" });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});

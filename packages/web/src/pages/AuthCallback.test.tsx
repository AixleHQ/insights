import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthCallback } from "./AuthCallback";

const mockLoginCallback = vi.fn();
const mockLogin = vi.fn();
const mockIsDeadSessionError = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../lib/auth", () => ({
  loginCallback: () => mockLoginCallback(),
  login: () => mockLogin(),
  isDeadSessionError: (err: unknown) => mockIsDeadSessionError(err),
}));

vi.mock("../lib/rollbar", () => ({
  reportAuthError: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const RETRY_FLAG = "auth_callback_retried";

describe("AuthCallback", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLoginCallback.mockReset();
    mockLogin.mockReset().mockResolvedValue(undefined);
    mockIsDeadSessionError.mockReset().mockReturnValue(false);
    sessionStorage.clear();
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

  it("full-page navigates (not SPA navigate) to an admin destination", async () => {
    mockLoginCallback.mockResolvedValue({ state: "/admin/login" });
    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy });

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith("/admin/login");
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
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

  it("silently retries login once on a dead-session error instead of showing the banner", async () => {
    mockLoginCallback.mockRejectedValue(new Error("invalid_grant: Code not valid"));
    mockIsDeadSessionError.mockReturnValue(true);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem(RETRY_FLAG)).toBe("1");
    expect(screen.queryByText("Authentication Failed")).not.toBeInTheDocument();
  });

  it("shows the failure banner (no further retry) when the retry has already been used", async () => {
    sessionStorage.setItem(RETRY_FLAG, "1");
    mockLoginCallback.mockRejectedValue(new Error("invalid_grant: Code not valid"));
    mockIsDeadSessionError.mockReturnValue(true);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Authentication Failed")).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("shows the failure banner without retrying on a non-dead-session error", async () => {
    mockLoginCallback.mockRejectedValue(new Error("something else"));
    mockIsDeadSessionError.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Authentication Failed")).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

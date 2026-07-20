import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./Login";

const mockLogin = vi.fn();
let mockIsAuthenticated = false;

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
    login: mockLogin,
    directLogin: vi.fn(),
  }),
}));

describe("Login", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockIsAuthenticated = false;
  });

  it("passes the redirect query param through to login()", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login?redirect=/invitations/tok-123"]}>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(mockLogin).toHaveBeenCalledWith("/invitations/tok-123");
  });

  it("calls login() without a redirect target when none is present", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(mockLogin).toHaveBeenCalledWith(undefined);
  });

  it("ignores an unsafe redirect query param", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login?redirect=http://evil.com"]}>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(mockLogin).toHaveBeenCalledWith(undefined);
  });

  it("full-page navigates (not SPA navigate) to an admin redirect target when already authenticated", () => {
    mockIsAuthenticated = true;
    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy });

    render(
      <MemoryRouter initialEntries={["/login?redirect=/admin/login"]}>
        <Login />
      </MemoryRouter>
    );

    expect(assignSpy).toHaveBeenCalledWith("/admin/login");

    vi.unstubAllGlobals();
  });
});

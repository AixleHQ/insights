import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./Login";

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
let mockIsAuthenticated = false;

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
    login: mockLogin,
    directLogin: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("Login (Landing)", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockNavigate.mockReset();
    mockIsAuthenticated = false;
  });

  it("renders the three auth CTAs", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with passkey/i })).toBeInTheDocument();
  });

  it("passkey button is disabled", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    const passkey = screen.getByRole("button", { name: /continue with passkey/i });
    expect(passkey).toBeDisabled();
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

  it("Continue with Email navigates to /login/email", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /continue with email/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/login/email");
  });

  it("Sign Up link navigates to /signup", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });

  it("full-page navigates to an admin redirect target when already authenticated", () => {
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

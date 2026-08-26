import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginEmail } from "./LoginEmail";

const mockDirectLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    directLogin: mockDirectLogin,
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("LoginEmail", () => {
  beforeEach(() => {
    mockDirectLogin.mockReset();
    mockNavigate.mockReset();
  });

  it("renders the sign-in title", () => {
    render(
      <MemoryRouter initialEntries={["/login/email"]}>
        <LoginEmail />
      </MemoryRouter>
    );
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it("calls directLogin with email and password on submit", async () => {
    mockDirectLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login/email"]}>
        <LoginEmail />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockDirectLogin).toHaveBeenCalledWith("test@example.com", "secret123");
    });
  });

  it("shows error on failed login", async () => {
    mockDirectLogin.mockRejectedValue(new Error("Invalid credentials"));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login/email"]}>
        <LoginEmail />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/^password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("Sign Up link navigates to /signup", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login/email"]}>
        <LoginEmail />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });
});

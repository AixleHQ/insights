import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectSettingsSection } from "./ProjectSettingsSection";

const mockUseProjectSettings = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectSettings: (...args: unknown[]) => mockUseProjectSettings(...args),
  useUpdateProjectSetting: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useDeleteProjectSetting: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}));

describe("ProjectSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the card with title and description", () => {
    mockUseProjectSettings.mockReturnValue({ data: { data: [] }, isLoading: false });

    render(<ProjectSettingsSection projectId="proj-1" />);

    expect(screen.getByText("Email Domain Auto-Join")).toBeInTheDocument();
    expect(
      screen.getByText("Users who register with this email domain will automatically join this project")
    ).toBeInTheDocument();
  });

  it("shows loading skeleton while settings are loading", () => {
    mockUseProjectSettings.mockReturnValue({ data: undefined, isLoading: true });

    render(<ProjectSettingsSection projectId="proj-1" />);

    expect(screen.queryByText("Email Domain Auto-Join")).not.toBeInTheDocument();
  });

  it("populates input with saved value", () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "allowed_email_domain", value: "acme.com" }] },
      isLoading: false,
    });

    render(<ProjectSettingsSection projectId="proj-1" />);

    const input = screen.getByPlaceholderText("example.com");
    expect(input).toHaveValue("acme.com");
  });

  it("disables save button when value matches saved value", () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "allowed_email_domain", value: "acme.com" }] },
      isLoading: false,
    });

    render(<ProjectSettingsSection projectId="proj-1" />);

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it("calls update mutation on save with normalized value", async () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    mockUpdateMutateAsync.mockResolvedValue({});

    render(<ProjectSettingsSection projectId="proj-1" />);
    const user = userEvent.setup();

    const input = screen.getByPlaceholderText("example.com");
    await user.type(input, "  ACME.COM  ");

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        projectId: "proj-1",
        key: "allowed_email_domain",
        value: "acme.com",
      });
    });
  });

  it("shows success feedback after saving", async () => {
    mockUseProjectSettings.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUpdateMutateAsync.mockResolvedValue({});

    render(<ProjectSettingsSection projectId="proj-1" />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("example.com"), "acme.com");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Settings saved")).toBeInTheDocument();
    });
  });

  it("shows error feedback when save fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUseProjectSettings.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUpdateMutateAsync.mockRejectedValue(new Error("Network error"));

    render(<ProjectSettingsSection projectId="proj-1" />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("example.com"), "acme.com");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save. Please try again.")).toBeInTheDocument();
    });
    consoleSpy.mockRestore();
  });

  it("shows validation error for invalid domain format", async () => {
    mockUseProjectSettings.mockReturnValue({ data: { data: [] }, isLoading: false });

    render(<ProjectSettingsSection projectId="proj-1" />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("example.com"), "not-a-domain");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Enter a valid domain like example.com")).toBeInTheDocument();
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("calls delete mutation when clearing a previously saved domain", async () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "allowed_email_domain", value: "acme.com" }] },
      isLoading: false,
    });
    mockDeleteMutateAsync.mockResolvedValue({});

    render(<ProjectSettingsSection projectId="proj-1" />);
    const user = userEvent.setup();

    const input = screen.getByPlaceholderText("example.com");
    await user.clear(input);

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith({
        projectId: "proj-1",
        key: "allowed_email_domain",
      });
    });
  });
});

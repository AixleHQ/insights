import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function TeamIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `/members/${id}?projectId=${projectId}` : `/members/${id}`;
  return <Navigate to={to} replace />;
}

function SettingsMembersIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const to = projectId ? `/members/${id}?projectId=${projectId}` : `/members/${id}`;
  return <Navigate to={to} replace />;
}

function MembersRedirectRoutes({ initialEntry }: { initialEntry: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/members" element={<LocationDisplay />} />
        <Route path="/members/invite" element={<LocationDisplay />} />
        <Route path="/members/invitations" element={<LocationDisplay />} />
        <Route path="/members/:id" element={<LocationDisplay />} />
        <Route path="/team" element={<Navigate to="/members" replace />} />
        <Route path="/team/invite" element={<Navigate to="/members/invite" replace />} />
        <Route path="/team/invitations" element={<Navigate to="/members/invitations" replace />} />
        <Route path="/team/:id" element={<TeamIdRedirect />} />
        <Route path="/settings/members" element={<Navigate to="/members" replace />} />
        <Route
          path="/settings/members/invite"
          element={<Navigate to="/members/invite" replace />}
        />
        <Route
          path="/settings/members/invitations"
          element={<Navigate to="/members/invitations" replace />}
        />
        <Route path="/settings/members/:id" element={<SettingsMembersIdRedirect />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("members backward-compat redirects", () => {
  it("redirects /team to /members", () => {
    render(<MembersRedirectRoutes initialEntry="/team" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members");
  });

  it("redirects /team/invite to /members/invite", () => {
    render(<MembersRedirectRoutes initialEntry="/team/invite" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/invite");
  });

  it("redirects /team/invitations to /members/invitations", () => {
    render(<MembersRedirectRoutes initialEntry="/team/invitations" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/invitations");
  });

  it("redirects /team/:id to /members/:id", () => {
    render(<MembersRedirectRoutes initialEntry="/team/mem-abc" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/mem-abc");
  });

  it("redirects /team/:id with projectId query to /members/:id", () => {
    render(<MembersRedirectRoutes initialEntry="/team/mem-abc?projectId=proj-1" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/mem-abc?projectId=proj-1");
  });

  it("redirects /settings/members to /members", () => {
    render(<MembersRedirectRoutes initialEntry="/settings/members" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members");
  });

  it("redirects /settings/members/invite to /members/invite", () => {
    render(<MembersRedirectRoutes initialEntry="/settings/members/invite" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/invite");
  });

  it("redirects /settings/members/invitations to /members/invitations", () => {
    render(<MembersRedirectRoutes initialEntry="/settings/members/invitations" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/invitations");
  });

  it("redirects /settings/members/:id to /members/:id", () => {
    render(<MembersRedirectRoutes initialEntry="/settings/members/mem-xyz" />);
    expect(screen.getByTestId("location")).toHaveTextContent("/members/mem-xyz");
  });

  it("redirects /settings/members/:id preserving projectId", () => {
    render(<MembersRedirectRoutes initialEntry="/settings/members/mem-xyz?projectId=proj-2" />);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/members/mem-xyz?projectId=proj-2",
    );
  });
});

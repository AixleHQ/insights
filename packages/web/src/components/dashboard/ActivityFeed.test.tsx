import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ActivityFeed } from "./ActivityFeed";

describe("ActivityFeed", () => {
  it("links View all to the unfiltered Events page by default", () => {
    render(<ActivityFeed events={[]} />);
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/events");
  });

  it("links View all to the provided viewAllTo destination (AIX-565)", () => {
    render(<ActivityFeed events={[]} viewAllTo="/events?project_id=proj-1&date_from=2026-07-01&date_to=2026-07-31" />);
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/events?project_id=proj-1&date_from=2026-07-01&date_to=2026-07-31"
    );
  });
});

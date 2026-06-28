import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "@/test/utils"
import { TabNav } from "./tab-nav"
import { TabsContent } from "./tabs"

const tabs = [
  { label: "Overview", key: "overview" },
  { label: "Events", key: "events" },
  { label: "Members", key: "members" },
]

describe("TabNav", () => {
  it("renders all tab labels", () => {
    render(
      <TabNav tabs={tabs} activeTab="overview" onChange={vi.fn()} />
    )
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Events" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument()
  })

  it("marks the active tab as selected", () => {
    render(
      <TabNav tabs={tabs} activeTab="events" onChange={vi.fn()} />
    )
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute("data-state", "active")
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("data-state", "inactive")
  })

  it("calls onChange with the correct key when a tab is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TabNav tabs={tabs} activeTab="overview" onChange={onChange} />
    )
    await user.click(screen.getByRole("tab", { name: "Events" }))
    expect(onChange).toHaveBeenCalledWith("events")
  })

  it("renders children as tab content", () => {
    render(
      <TabNav tabs={tabs} activeTab="overview" onChange={vi.fn()}>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="events">Events content</TabsContent>
      </TabNav>
    )
    expect(screen.getByText("Overview content")).toBeInTheDocument()
  })

  it("applies default variant to TabsList when variant prop is passed", () => {
    const { container } = render(
      <TabNav tabs={tabs} activeTab="overview" onChange={vi.fn()} variant="default" />
    )
    const tabsList = container.querySelector('[role="tablist"]')
    expect(tabsList).toBeInTheDocument()
  })

  it("supports keyboard navigation between tabs", async () => {
    const user = userEvent.setup()
    render(
      <TabNav tabs={tabs} activeTab="overview" onChange={vi.fn()} />
    )
    const overviewTab = screen.getByRole("tab", { name: "Overview" })
    overviewTab.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: "Events" })).toHaveFocus()
  })
})

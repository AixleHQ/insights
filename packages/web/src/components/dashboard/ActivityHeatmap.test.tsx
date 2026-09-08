import { describe, it, expect } from "vitest"
import { screen } from "@testing-library/react"
import { render } from "@/test/utils"
import { ActivityHeatmap } from "./ActivityHeatmap"

const oneDay = { date: "2025-01-15", count: 10 }

describe("ActivityHeatmap", () => {
  it("renders the label when provided", () => {
    render(
      <ActivityHeatmap
        data={[oneDay]}
        label="24,134 events in the last year"
      />
    )
    expect(screen.getByText("24,134 events in the last year")).toBeInTheDocument()
  })

  it("renders without label gracefully", () => {
    render(<ActivityHeatmap data={[oneDay]} />)
    // Should not throw or crash; legend should still be present
    expect(screen.getByText("Less")).toBeInTheDocument()
    expect(screen.getByText("More")).toBeInTheDocument()
  })

  it("renders the Less/More legend", () => {
    render(<ActivityHeatmap data={[oneDay]} label="1 event in the last year" />)
    expect(screen.getByText("Less")).toBeInTheDocument()
    expect(screen.getByText("More")).toBeInTheDocument()
  })

  it("active cells use primary color class", () => {
    const { container } = render(
      <ActivityHeatmap data={[oneDay]} label="10 events in the last year" />
    )
    // At least one cell should have a bg-primary class (achromatic intensity bucket)
    const primaryCells = container.querySelectorAll('[class*="bg-primary"]')
    expect(primaryCells.length).toBeGreaterThan(0)
  })

  it("renders grid without errors when data has activity", () => {
    render(
      <ActivityHeatmap data={[oneDay]} label="10 events in the last year" />
    )
    expect(screen.getByText("Less")).toBeInTheDocument()
  })
})

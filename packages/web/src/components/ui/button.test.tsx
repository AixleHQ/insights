import { describe, it, expect } from "vitest"
import { screen } from "@testing-library/react"
import { render } from "@/test/utils"
import { Button } from "./button"

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("shows spinner and disables button when isLoading", () => {
    render(<Button isLoading>Save</Button>)
    const btn = screen.getByRole("button")
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute("aria-busy", "true")
    expect(btn.querySelector("svg")).toBeInTheDocument()
    expect(btn.querySelector(".sr-only")).toHaveTextContent("Loading")
  })

  it("does not show spinner when not loading", () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole("button").querySelector("svg")).toBeNull()
  })

  it("is disabled when both disabled and isLoading are set", () => {
    render(<Button disabled isLoading>Save</Button>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("applies outline variant class", () => {
    render(<Button variant="outline">Cancel</Button>)
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("border")
  })

  it("applies ghost variant — no background or border by default", () => {
    render(<Button variant="ghost">Skip</Button>)
    const btn = screen.getByRole("button", { name: "Skip" })
    expect(btn).not.toHaveClass("bg-primary")
    expect(btn).not.toHaveClass("border")
  })

  it("applies sm size", () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass("h-8")
  })

  it("applies lg size", () => {
    render(<Button size="lg">Large</Button>)
    expect(screen.getByRole("button", { name: "Large" })).toHaveClass("h-10")
  })
})

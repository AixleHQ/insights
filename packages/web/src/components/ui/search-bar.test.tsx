import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "@/test/utils"
import { SearchBar } from "./search-bar"

describe("SearchBar", () => {
  it("renders a search input with the given placeholder", () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search events..." />)
    expect(screen.getByPlaceholderText("Search events...")).toBeInTheDocument()
  })

  it("renders the search icon", () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} />)
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("calls onChange with the typed value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    // Controlled input: each keystroke fires onChange with that character only
    await user.type(screen.getByRole("textbox"), "hello")
    expect(onChange).toHaveBeenCalledWith("h")
  })

  it("shows shortcut hint when value is empty", () => {
    render(<SearchBar value="" onChange={vi.fn()} shortcutHint="⌘K" />)
    expect(screen.getByText("⌘K")).toBeInTheDocument()
  })

  it("hides shortcut hint and shows clear button when value is present", () => {
    render(<SearchBar value="hello" onChange={vi.fn()} shortcutHint="⌘K" />)
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument()
  })

  it("calls onChange with empty string when clear button is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchBar value="hello" onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Clear search" }))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("clears value on Escape key", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchBar value="hello" onChange={onChange} />)
    await user.type(screen.getByRole("textbox"), "{Escape}")
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("does not show clear button when value is empty", () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "@/test/utils"
import { DataTable, type ColumnDef } from "./data-table"

interface User {
  id: string
  name: string
  email: string
  score: number
}

const columns: ColumnDef<User>[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "score", label: "Score" },
]

const rows: User[] = [
  { id: "1", name: "Alice", email: "alice@example.com", score: 42 },
  { id: "2", name: "Bob", email: "bob@example.com", score: 17 },
]

const getRowKey = (row: User) => row.id

describe("DataTable", () => {
  it("renders column headers", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={getRowKey} />
    )
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Email")).toBeInTheDocument()
    expect(screen.getByText("Score")).toBeInTheDocument()
  })

  it("renders row cells via default accessor", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={getRowKey} />
    )
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("bob@example.com")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
  })

  it("renders custom render function output", () => {
    const customColumns: ColumnDef<User>[] = [
      ...columns.slice(0, 2),
      {
        key: "score",
        label: "Score",
        render: (row) => <span data-testid="score">{row.score * 2}</span>,
      },
    ]
    render(
      <DataTable columns={customColumns} rows={rows} getRowKey={getRowKey} />
    )
    const scoreEls = screen.getAllByTestId("score")
    expect(scoreEls[0]).toHaveTextContent("84")
    expect(scoreEls[1]).toHaveTextContent("34")
  })

  it("applies headerClassName to th and className to td", () => {
    const styledColumns: ColumnDef<User>[] = [
      { key: "name", label: "Name", headerClassName: "text-right", className: "font-bold" },
    ]
    render(
      <DataTable columns={styledColumns} rows={rows} getRowKey={getRowKey} />
    )
    const th = screen.getByRole("columnheader", { name: "Name" })
    expect(th.className).toContain("text-right")

    const cells = screen.getAllByRole("cell", { name: /Alice|Bob/ })
    cells.forEach((cell) => expect(cell.className).toContain("font-bold"))
  })

  it("shows default empty state when rows is empty", () => {
    render(
      <DataTable columns={columns} rows={[]} getRowKey={getRowKey} />
    )
    expect(screen.getByText("No data")).toBeInTheDocument()
  })

  it("shows custom emptyState slot when provided", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={getRowKey}
        emptyState={<span>Nothing here</span>}
      />
    )
    expect(screen.getByText("Nothing here")).toBeInTheDocument()
    expect(screen.queryByText("No data")).not.toBeInTheDocument()
  })

  it("shows 5 skeleton rows when isLoading is true and no data cells are visible", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={getRowKey}
        isLoading={true}
      />
    )
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
    expect(screen.queryByText("No data")).not.toBeInTheDocument()
    // 1 header row + 5 skeleton rows
    expect(screen.getAllByRole("row")).toHaveLength(6)
  })

  it("calls onRowClick with the correct row when a row is clicked", () => {
    const onClick = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        onRowClick={onClick}
      />
    )
    fireEvent.click(screen.getByText("Alice"))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledWith(rows[0])
  })

  it("does not crash when onRowClick is absent and a row is clicked", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={getRowKey} />
    )
    expect(() => fireEvent.click(screen.getByText("Alice"))).not.toThrow()
  })

  it("adds cursor-pointer class to data rows when onRowClick is provided", () => {
    const onClick = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        onRowClick={onClick}
      />
    )
    const dataRows = screen.getAllByRole("row").slice(1)
    dataRows.forEach((row) => expect(row.className).toContain("cursor-pointer"))
  })

  it("does not add cursor-pointer when onRowClick is absent", () => {
    render(
      <DataTable columns={columns} rows={rows} getRowKey={getRowKey} />
    )
    const dataRows = screen.getAllByRole("row").slice(1)
    dataRows.forEach((row) =>
      expect(row.className).not.toContain("cursor-pointer")
    )
  })

  it("renders empty string for null/undefined cell values via default accessor", () => {
    const sparseRows = [
      {
        id: "1",
        name: "Alice",
        email: undefined as unknown as string,
        score: 0,
      },
    ]
    render(
      <DataTable columns={columns} rows={sparseRows} getRowKey={getRowKey} />
    )
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.queryByText("undefined")).not.toBeInTheDocument()
    expect(screen.queryByText("null")).not.toBeInTheDocument()
  })

  it("triggers onRowClick via Enter key", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        onRowClick={onClick}
      />
    )
    const dataRows = screen.getAllByRole("row").slice(1)
    await user.type(dataRows[0], "{Enter}")
    expect(onClick).toHaveBeenCalledWith(rows[0])
  })

  it("triggers onRowClick via Space key", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        onRowClick={onClick}
      />
    )
    const dataRows = screen.getAllByRole("row").slice(1)
    await user.type(dataRows[0], " ")
    expect(onClick).toHaveBeenCalledWith(rows[0])
  })
})

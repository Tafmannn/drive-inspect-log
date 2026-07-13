/**
 * A11Y-001: CompactTable's clickable rows rendered as plain <tr> elements
 * with only an onClick handler — no tabIndex, no keyboard handler, no ARIA
 * role. A keyboard-only or screen-reader user could not perceive the row
 * as interactive, focus it, or activate it. This component backs the
 * primary row-click interaction on most of the Control Centre (Jobs,
 * Drivers, Compliance, Finance, Clients, POD Review, Overview), so the fix
 * here restores keyboard access across all of them at once.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompactTable, type CompactColumn } from "@/features/control/components/shared/CompactTable";

interface Row {
  id: string;
  name: string;
}

const columns: CompactColumn<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name },
];

const rows: Row[] = [{ id: "1", name: "Alpha" }, { id: "2", name: "Beta" }];

describe("CompactTable keyboard accessibility (A11Y-001)", () => {
  it("marks clickable rows as focusable buttons", () => {
    render(<CompactTable columns={columns} data={rows} onRowClick={() => {}} />);
    const row = screen.getByText("Alpha").closest("tr")!;
    expect(row).toHaveAttribute("tabIndex", "0");
    expect(row).toHaveAttribute("role", "button");
  });

  it("activates onRowClick on Enter and on Space, not on other keys", () => {
    const onRowClick = vi.fn();
    render(<CompactTable columns={columns} data={rows} onRowClick={onRowClick} />);
    const row = screen.getByText("Alpha").closest("tr")!;

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(row, { key: "a" });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("leaves non-interactive rows (no onRowClick) with no tabIndex or role", () => {
    render(<CompactTable columns={columns} data={rows} />);
    const row = screen.getByText("Alpha").closest("tr")!;
    expect(row).not.toHaveAttribute("tabIndex");
    expect(row).not.toHaveAttribute("role");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountStatusGate } from "@/components/AccountStatusGate";
import type { AppUser } from "@/context/AuthContext";

function user(overrides: Partial<AppUser>): AppUser {
  return {
    id: "u1",
    name: "Test",
    email: "test@example.com",
    roles: ["DRIVER"],
    status: "active",
    ...overrides,
  };
}

describe("AccountStatusGate", () => {
  it("renders a suspended message for a suspended account", () => {
    render(<AccountStatusGate user={user({ accountStatus: "suspended" })} />);
    expect(screen.getByText("Account Suspended")).toBeInTheDocument();
  });

  it("renders a pending message for a pending_activation account", () => {
    render(<AccountStatusGate user={user({ accountStatus: "pending_activation" })} />);
    expect(screen.getByText("Account Pending")).toBeInTheDocument();
  });

  it("renders nothing for an active account", () => {
    const { container } = render(<AccountStatusGate user={user({ accountStatus: "active" })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when accountStatus is undefined", () => {
    const { container } = render(<AccountStatusGate user={user({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a null user", () => {
    const { container } = render(<AccountStatusGate user={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

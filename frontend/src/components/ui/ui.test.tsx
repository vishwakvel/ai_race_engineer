import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

describe("Panel", () => {
  it("renders title as a heading and children", () => {
    render(
      <Panel title="LAP TIMES">
        <span>body</span>
      </Panel>
    );
    expect(screen.getByRole("heading", { name: "LAP TIMES" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the action slot", () => {
    render(
      <Panel title="T" action={<button>act</button>}>
        x
      </Panel>
    );
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("defaults to type=button", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute(
      "type",
      "button"
    );
  });

  it("disables natively", () => {
    render(<Button disabled>No</Button>);
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });
});

describe("EmptyState", () => {
  it("shows the label", () => {
    render(<EmptyState label="AWAITING DATA" />);
    expect(screen.getByText("AWAITING DATA")).toBeInTheDocument();
  });
});

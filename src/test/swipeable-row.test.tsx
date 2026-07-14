import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SwipeableRow, type SwipeAction } from "@/components/SwipeableRow";

// jsdom has no PointerEvent constructor, so `fireEvent.pointerDown(el, {
// clientX, clientY })` silently drops those init fields (the testing-library
// event-map falls back to plain `Event`, whose init dict doesn't carry
// coordinates) — build real MouseEvents and stamp pointerId on manually.
function pointerEvent(type: string, clientX: number, clientY: number, pointerId: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY } as MouseEventInit);
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  return event;
}

function drag(el: Element, fromX: number, toX: number, fromY = 0, toY = 0) {
  fireEvent(el, pointerEvent("pointerdown", fromX, fromY, 1));
  fireEvent(el, pointerEvent("pointermove", toX, toY, 1));
  fireEvent(el, pointerEvent("pointerup", toX, toY, 1));
}

function setup() {
  const onCall = vi.fn();
  const onChildClick = vi.fn();
  const actions: SwipeAction[] = [
    { label: "Call", icon: <span />, onAction: onCall },
  ];
  const utils = render(
    <SwipeableRow actions={actions}>
      <div data-testid="row-content" onClick={onChildClick}>
        Job card
      </div>
    </SwipeableRow>,
  );
  const draggable = utils.getByTestId("row-content").parentElement!;
  return { ...utils, onCall, onChildClick, draggable };
}

describe("SwipeableRow", () => {
  it("a plain tap (no drag) still reaches the child's onClick", () => {
    const { getByTestId, onChildClick } = setup();
    fireEvent.click(getByTestId("row-content"));
    expect(onChildClick).toHaveBeenCalledTimes(1);
  });

  it("dragging left past half the action width snaps open", () => {
    const { draggable } = setup();
    drag(draggable, 200, 100); // 100px left, > half of the single 72px action
    expect(draggable.getAttribute("style")).toContain("translateX(-72px)");
  });

  it("the browser's residual click right after a drag doesn't reach the child or re-close the panel", () => {
    // Real browsers fire a native `click` immediately after mouseup even
    // when that mouseup ended a drag — this must be swallowed, not treated
    // as an intentional tap (which would otherwise instantly close the
    // panel this same gesture just opened).
    const { getByTestId, draggable, onChildClick } = setup();
    drag(draggable, 200, 100);
    fireEvent.click(getByTestId("row-content"));
    expect(onChildClick).not.toHaveBeenCalled();
    expect(draggable.getAttribute("style")).toContain("translateX(-72px)");
  });

  it("a genuinely separate tap on an already-open row closes it instead of firing the child's onClick", () => {
    const { getByTestId, draggable, onChildClick } = setup();
    drag(draggable, 200, 100);
    fireEvent.click(getByTestId("row-content")); // browser's residual click, swallowed
    fireEvent.click(getByTestId("row-content")); // a real, later tap
    expect(onChildClick).not.toHaveBeenCalled();
    expect(draggable.getAttribute("style")).toContain("translateX(0px)");
  });

  it("dragging less than half the action width snaps back closed", () => {
    const { draggable } = setup();
    drag(draggable, 200, 185); // 15px, well under half of 72px
    expect(draggable.getAttribute("style")).toContain("translateX(0px)");
  });

  it("tapping a revealed action fires onAction and resets the offset", () => {
    const { getByText, draggable, onCall } = setup();
    drag(draggable, 200, 100);
    fireEvent.click(getByText("Call"));
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(draggable.getAttribute("style")).toContain("translateX(0px)");
  });

  it("a vertical drag does not trigger the horizontal swipe reveal", () => {
    const { draggable } = setup();
    drag(draggable, 100, 110, 100, 250); // mostly vertical movement
    expect(draggable.getAttribute("style")).toContain("translateX(0px)");
  });
});

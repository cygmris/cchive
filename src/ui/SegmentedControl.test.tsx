/**
 * SegmentedControl behavior tests — selecting a segment calls onChange with its
 * value, and the active segment is reflected (the pill rides the checked radio).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./SegmentedControl";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];

describe("SegmentedControl", () => {
  it("calls onChange with the clicked segment's value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Letters"
        options={OPTIONS}
        value="a"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("marks only the active segment as checked", () => {
    render(
      <SegmentedControl
        aria-label="Letters"
        options={OPTIONS}
        value="b"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "C" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("moves selection with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Letters"
        options={OPTIONS}
        value="a"
        onChange={onChange}
      />,
    );

    screen.getByRole("radio", { name: "A" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

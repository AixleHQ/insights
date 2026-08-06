import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 350));
    expect(result.current).toBe("a");
  });

  it("updates only after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 350),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ab");
  });

  it("resets the timer when the value changes again before delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 350),
      { initialProps: { value: "" } }
    );

    rerender({ value: "g" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "gi" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("gi");
  });
});

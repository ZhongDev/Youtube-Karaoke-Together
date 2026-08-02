import { describe, expect, it, vi } from "vitest";
import { announceUsername, subscribeToUsername } from "./usernameSync";

describe("username sync channel", () => {
  it("delivers an announced name to every subscriber until it unsubscribes", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToUsername(handler);

    expect(announceUsername("Singer [2]")).toBe(true);
    expect(handler).toHaveBeenCalledWith("Singer [2]");

    unsubscribe();
    announceUsername("Someone Else");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores announcements without a usable name", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToUsername(handler);

    expect(announceUsername("")).toBe(false);
    expect(announceUsername(undefined)).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    unsubscribe();
  });
});

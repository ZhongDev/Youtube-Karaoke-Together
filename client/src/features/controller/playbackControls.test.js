import { describe, expect, it } from "vitest";
import {
  clampPlaybackPosition,
  formatPlaybackTimestamp,
  isPlaybackActive,
  parsePlaybackTimestamp,
} from "./playbackControls";

describe("controller playback helpers", () => {
  it("bounds timeline and relative seek positions", () => {
    expect(clampPlaybackPosition(-15, 120)).toBe(0);
    expect(clampPlaybackPosition(45, 120)).toBe(45);
    expect(clampPlaybackPosition(150, 120)).toBe(120);
    expect(clampPlaybackPosition(Number.NaN, null)).toBe(0);
  });

  it("treats playing and buffering as active playback", () => {
    expect(isPlaybackActive("playing")).toBe(true);
    expect(isPlaybackActive("buffering")).toBe(true);
    expect(isPlaybackActive("paused")).toBe(false);
  });

  it("parses exact minute and hour timestamps with optional milliseconds", () => {
    expect(parsePlaybackTimestamp("02:03")).toBe(123);
    expect(parsePlaybackTimestamp("1:02:03.045")).toBe(3723.045);
    expect(parsePlaybackTimestamp("00:00.5")).toBe(0.5);
    expect(parsePlaybackTimestamp(" 09:08.007 ")).toBe(548.007);
  });

  it("rejects timestamps outside the required clock format", () => {
    expect(parsePlaybackTimestamp("75")).toBeNull();
    expect(parsePlaybackTimestamp("01:60")).toBeNull();
    expect(parsePlaybackTimestamp("1:60:00")).toBeNull();
    expect(parsePlaybackTimestamp("01:02.0000")).toBeNull();
    expect(parsePlaybackTimestamp("-01:00")).toBeNull();
  });

  it("formats exact timestamps with hours only when needed", () => {
    expect(formatPlaybackTimestamp(0)).toBe("00:00.000");
    expect(formatPlaybackTimestamp(75.25)).toBe("01:15.250");
    expect(formatPlaybackTimestamp(3723.045)).toBe("01:02:03.045");
  });
});

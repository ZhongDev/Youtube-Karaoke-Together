import { describe, expect, it } from "vitest";
import { playerResumeSeconds, playerVideoIdentity, shouldLoadPlayerVideo } from "./playerIdentity";

describe("room player identity", () => {
  it("does not reload when only current-video metadata changes", () => {
    const current = { queueId: "12", id: "abcdefghijk", colorHue: 10 };
    const recolored = { ...current, colorHue: 240 };
    expect(shouldLoadPlayerVideo(playerVideoIdentity(current), recolored)).toBe(false);
  });

  it("reloads a repeated YouTube video when it is a different queue item", () => {
    const current = { queueId: "12", id: "abcdefghijk" };
    const repeated = { queueId: "13", id: "abcdefghijk" };
    expect(shouldLoadPlayerVideo(playerVideoIdentity(current), repeated)).toBe(true);
    expect(playerResumeSeconds({ queueId: "12", videoId: "abcdefghijk", positionSec: 119 }, repeated)).toBe(0);
  });

  it("resumes the same queue item from its bounded checkpoint", () => {
    const current = { queueId: "12", id: "abcdefghijk" };
    expect(playerResumeSeconds({ queueId: "12", videoId: "abcdefghijk", positionSec: 120, durationSec: 120 }, current)).toBe(119.25);
  });
});

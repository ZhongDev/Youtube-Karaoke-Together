import { afterEach, describe, expect, it, vi } from "vitest";
import { lineIndexAt, readingText, timedLines } from "./lyricsDocument";
import { MAX_EXTRAPOLATION_MS, estimatePlaybackMs, lyricTimeMs } from "./playbackEstimate";
import { bestSample, probeSample, serverClockStats, serverNow, startServerClock, stopServerClock } from "./serverClock";
import { SyncClock } from "./syncClock";
import { FADE_MIN_MS, LEAD_MS, estimateSingMs, laneStateAt, scheduleTwoTrack, wipeEndOf, wipeProgress } from "./twoTrack";

const line = (timeMs, text, words) => ({ timeMs, text, ...(words ? { words } : {}) });

describe("server clock", () => {
  afterEach(() => stopServerClock());

  it("assumes the server read its clock halfway through the round trip", () => {
    expect(probeSample(1000, 1100, 50_050)).toEqual({ offsetMs: 49_000, rttMs: 100 });
  });

  it("trusts the fastest round trip, which leaves the least room for asymmetric delay", () => {
    const samples = [{ offsetMs: 10, rttMs: 300 }, { offsetMs: 2, rttMs: 40 }, { offsetMs: 7, rttMs: 90 }];
    expect(bestSample(samples)).toEqual({ offsetMs: 2, rttMs: 40 });
    expect(bestSample([])).toBeNull();
  });

  it("probes a connected socket and converts local time to server time", async () => {
    const skewMs = 123_456;
    const socket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      timeout() { return this; },
      emit: vi.fn((event, payload, callback) => {
        expect(event).toBe("time-sync");
        callback(null, { ok: true, serverTime: Date.now() + skewMs });
      }),
    };
    startServerClock(socket);
    await vi.waitFor(() => expect(socket.emit).toHaveBeenCalledTimes(5));
    expect(serverClockStats().synced).toBe(true);
    expect(Math.abs(serverNow() - (Date.now() + skewMs))).toBeLessThan(50);
  });
});

describe("room player clock", () => {
  it("anchors when the reported time changes and extrapolates between reports", () => {
    const clock = new SyncClock();
    clock.poll(10, 1000, 1, true);
    expect(clock.timeS(1100)).toBeCloseTo(10.1);
    // The embed repeats a stale value: that must not drag the estimate back.
    clock.poll(10, 1200, 1, true);
    expect(clock.timeS(1200)).toBeCloseTo(10.2);
    expect(clock.sampleAgeMs(1200)).toBe(200);
    clock.poll(10.25, 1250, 1, true);
    expect(clock.timeS(1250)).toBeCloseTo(10.25);
    expect(clock.sampleAgeMs(1250)).toBe(0);
  });

  it("freezes while paused, follows the playback rate, and reports seeks", () => {
    const clock = new SyncClock();
    clock.poll(30, 0, 1, false);
    expect(clock.timeS(5000)).toBe(30);
    expect(clock.sampleAgeMs(5000)).toBe(0);
    clock.poll(30, 5000, 2, true);
    expect(clock.timeS(5500)).toBeCloseTo(31);
    expect(clock.poll(90, 5600, 2, true)).toBe(true);
    expect(clock.poll(90.1, 5650, 2, true)).toBe(false);
  });
});

describe("controller playback estimate", () => {
  const playback = { state: "playing", positionSec: 20, sampledAt: 100_000, playbackRate: 1, durationSec: 200 };

  it("extrapolates from the server-stamped sample, whatever the message delay", () => {
    expect(estimatePlaybackMs(playback, 100_750)).toBe(20_750);
    expect(estimatePlaybackMs({ ...playback, playbackRate: 1.5 }, 101_000)).toBe(21_500);
  });

  it("holds still when paused and stops extrapolating a silent room", () => {
    expect(estimatePlaybackMs({ ...playback, state: "paused" }, 160_000)).toBe(20_000);
    expect(estimatePlaybackMs(playback, 100_000 + 60_000)).toBe(20_000 + MAX_EXTRAPOLATION_MS);
    expect(estimatePlaybackMs({ ...playback, positionSec: 199.9 }, 102_000)).toBe(200_000);
    expect(estimatePlaybackMs(null, 0)).toBeNull();
  });

  it("treats a positive offset as a delay", () => {
    expect(lyricTimeMs(10_500, 500)).toBe(10_000);
    expect(lyricTimeMs(10_000, -250)).toBe(10_250);
  });
});

describe("lyrics documents", () => {
  const document = {
    synced: true,
    readingMode: "romaji",
    lines: [
      { t: 1000, text: "夜に", ruby: [{ base: "夜", ruby: "yoru" }, { base: "に", ruby: "ni" }] },
      { t: 4000, text: "Never gonna", words: [{ t: 4000, text: "Never " }, { t: 4500, text: "gonna" }] },
    ],
  };

  it("maps server lines to timed lines and finds the line being sung", () => {
    const lines = timedLines(document);
    expect(lines[1]).toEqual({ timeMs: 4000, text: "Never gonna", words: [{ timeMs: 4000, text: "Never " }, { timeMs: 4500, text: "gonna" }] });
    expect(lineIndexAt(lines, 999)).toBe(-1);
    expect(lineIndexAt(lines, 3999)).toBe(0);
    expect(lineIndexAt(lines, 9000)).toBe(1);
    expect(timedLines({ ...document, synced: false })).toEqual([]);
  });

  it("joins readings per word, or continuously for furigana", () => {
    expect(readingText(document.lines[0].ruby, "romaji")).toBe("yoru ni");
    expect(readingText([{ base: "食", ruby: "た" }, { base: "べる" }], "furigana")).toBe("たべる");
    expect(readingText([{ base: "plain" }], "romaji")).toBe("");
  });
});

describe("two-track scheduler", () => {
  it("estimates singing time from the text, counting CJK characters as syllables", () => {
    expect(estimateSingMs("")).toBe(600);
    expect(estimateSingMs("夜に駆ける")).toBe(5 * 280);
    expect(wipeEndOf(line(1000, "hello world"), 1500)).toBe(1500);
  });

  it("alternates lanes and shows each line ahead of its timestamp", () => {
    const lines = [line(10_000, "one"), line(14_000, "two"), line(18_000, "three"), line(22_000, "four")];
    const schedule = scheduleTwoTrack(lines);
    expect(schedule.lanes[0].map((entry) => entry.index)).toEqual([0, 2]);
    expect(schedule.lanes[1].map((entry) => entry.index)).toEqual([1, 3]);
    expect(schedule.lanes[0][0].showMs).toBe(10_000 - LEAD_MS);
    for (const entry of schedule.lanes.flat()) {
      expect(entry.departMs).toBeGreaterThanOrEqual(entry.wipeEndMs);
      expect(entry.fadeInMs).toBeGreaterThanOrEqual(FADE_MIN_MS);
    }
    expect(laneStateAt(schedule, lines, 0, 5000)).toBeNull();
    const singing = laneStateAt(schedule, lines, 0, 10_100);
    expect(singing.entry.index).toBe(0);
    expect(singing.opacity).toBe(1);
    expect(singing.progress).toBeGreaterThan(0);
  });

  it("skips blank lines but lets them end the line before", () => {
    const lines = [line(1000, "sing"), line(1400, ""), line(9000, "again")];
    const schedule = scheduleTwoTrack(lines);
    expect(schedule.lanes.flat().map((entry) => entry.index).sort()).toEqual([0, 2]);
    expect(schedule.lanes.flat().find((entry) => entry.index === 0).wipeEndMs).toBe(1400);
  });

  it("follows word timings through the wipe", () => {
    const words = [{ timeMs: 1000, text: "ab" }, { timeMs: 3000, text: "cd" }];
    const entry = { startMs: 1000, wipeEndMs: 5000 };
    expect(wipeProgress(line(1000, "abcd", words), entry, 2000)).toBeCloseTo(0.25);
    expect(wipeProgress(line(1000, "abcd", words), entry, 4000)).toBeCloseTo(0.75);
  });
});

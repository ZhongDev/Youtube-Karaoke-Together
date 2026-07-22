import { describe, expect, it, vi } from "vitest";
import {
  applyPlayerCommand,
  loadPlayerVideo,
  playerPlaybackSnapshot,
  playbackVolume,
  playerCommandMatchesVideo,
  playerPlaybackMatchesVideo,
  reconcilePlayerIntent,
} from "./playerControls";

function player() {
  return {
    loadVideoById: vi.fn(),
    pauseVideo: vi.fn(),
    playVideo: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    getPlayerState: vi.fn(() => 2),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
  };
}

describe("room player controls", () => {
  it("loads a paused checkpoint without discarding its saved volume", () => {
    const target = player();
    const identity = loadPlayerVideo(
      target,
      { id: "abcdefghijk", queueId: "12" },
      { state: "paused", queueId: "12", videoId: "abcdefghijk", volume: 36 },
      42
    );
    expect(identity).toBe("queue:12");
    expect(target.setVolume).toHaveBeenCalledWith(36);
    expect(target.loadVideoById).toHaveBeenCalledWith({ videoId: "abcdefghijk", startSeconds: 42 });
    expect(target.pauseVideo).toHaveBeenCalledOnce();
    expect(target.playVideo).not.toHaveBeenCalled();
  });

  it("loads and starts an active checkpoint", () => {
    const target = player();
    loadPlayerVideo(
      target,
      { id: "abcdefghijk", queueId: "12" },
      { state: "playing", volume: 55 },
      18
    );
    expect(target.loadVideoById).toHaveBeenCalledWith({ videoId: "abcdefghijk", startSeconds: 18 });
    expect(target.playVideo).toHaveBeenCalledOnce();
  });

  it("does not carry a stale paused state into the next queue item", () => {
    const target = player();
    loadPlayerVideo(
      target,
      { id: "bbbbbbbbbbb", queueId: "13" },
      { state: "paused", queueId: "12", videoId: "aaaaaaaaaaa", volume: 55 },
      0
    );
    expect(target.loadVideoById).toHaveBeenCalledOnce();
    expect(target.playVideo).toHaveBeenCalledOnce();
  });

  it("does not publish an initializing state or erase a paused checkpoint", () => {
    const video = { id: "abcdefghijk", queueId: "12" };
    const playback = {
      state: "paused",
      queueId: "12",
      videoId: "abcdefghijk",
      positionSec: 42,
      durationSec: 120,
    };
    const initializing = player();
    initializing.getPlayerState.mockReturnValue(-1);
    expect(playerPlaybackSnapshot(initializing, video, playback)).toBeNull();

    const paused = player();
    expect(playerPlaybackSnapshot(paused, video, playback, true)).toEqual({
      state: "paused",
      positionSec: 42,
      durationSec: 120,
    });
  });

  it("reconciles paused position and volume while the iframe initializes", () => {
    const target = player();
    target.getPlayerState.mockReturnValue(3);
    expect(reconcilePlayerIntent(
      target,
      { id: "abcdefghijk", queueId: "12" },
      { state: "paused", queueId: "12", positionSec: 42, volume: 36 },
      3,
      true
    )).toBe(false);
    expect(target.setVolume).toHaveBeenCalledWith(36);
    expect(target.seekTo).toHaveBeenCalledWith(42, true);
    expect(target.pauseVideo).toHaveBeenCalledOnce();
  });

  it("releases a completed restore so the room player can resume itself", () => {
    const target = player();
    target.getCurrentTime.mockReturnValue(42);
    const video = { id: "abcdefghijk", queueId: "12" };
    const playback = { state: "paused", queueId: "12", positionSec: 42, volume: 36 };

    expect(reconcilePlayerIntent(target, video, playback, 2, true)).toBe(true);
    target.pauseVideo.mockClear();
    expect(reconcilePlayerIntent(target, video, playback, 1, false)).toBe(false);
    expect(target.pauseVideo).not.toHaveBeenCalled();
    target.getPlayerState.mockReturnValue(1);
    target.getCurrentTime.mockReturnValue(43);
    expect(playerPlaybackSnapshot(target, video, playback, false)).toEqual({
      state: "playing",
      positionSec: 43,
      durationSec: null,
    });
  });

  it("applies play, pause, seek, and volume commands", () => {
    const target = player();
    expect(applyPlayerCommand(target, { type: "play" })).toBe(true);
    expect(applyPlayerCommand(target, { type: "pause" })).toBe(true);
    expect(applyPlayerCommand(target, { type: "seek", positionSec: 75 })).toBe(true);
    expect(applyPlayerCommand(target, { type: "volume", volume: 41.7 })).toBe(true);
    expect(target.playVideo).toHaveBeenCalledOnce();
    expect(target.pauseVideo).toHaveBeenCalledOnce();
    expect(target.seekTo).toHaveBeenCalledWith(75, true);
    expect(target.setVolume).toHaveBeenCalledWith(42);
  });

  it("rejects stale video commands while allowing room-level volume", () => {
    const video = { id: "abcdefghijk", queueId: "12" };
    expect(playerCommandMatchesVideo({ type: "seek", queueId: "12" }, video)).toBe(true);
    expect(playerCommandMatchesVideo({ type: "pause", queueId: "13" }, video)).toBe(false);
    expect(playerCommandMatchesVideo({ type: "volume", queueId: null }, video)).toBe(true);
    expect(playerPlaybackMatchesVideo({ queueId: "12" }, video)).toBe(true);
    expect(playerPlaybackMatchesVideo({ queueId: "13", videoId: video.id }, video)).toBe(false);
    expect(playbackVolume({})).toBe(100);
  });
});

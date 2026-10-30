import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LyricsOverlay from "../lyrics/LyricsOverlay";
import ControlsTab from "./ControlsTab";
import LyricsTab from "./LyricsTab";

const STATE = {
  enabled: true, perUser: false, display: true, queueId: "12", videoId: "abcdefghijk",
  status: "ready", sources: [{ id: "lrclib", kind: "synced_line" }, { id: "netease", kind: "synced_line" }],
  source: "lrclib", kind: "synced_line", language: "ja", defaultSource: null, defaultOffsetMs: 0,
  sourceOverridden: false, offsetMs: 0, offsetOverridden: false, revision: "abcdefghijk:lrclib:1",
};
const DOCUMENT = {
  videoId: "abcdefghijk", source: "lrclib", kind: "synced_line", synced: true, language: "ja",
  readingMode: "romaji", revision: "abcdefghijk:lrclib:1",
  lines: [
    { t: 1000, text: "夜に駆ける", ruby: [{ base: "夜", ruby: "yoru" }, { base: "に", ruby: "ni" }, { base: "駆ける", ruby: "kakeru" }] },
    { t: 6000, text: "Second line" },
  ],
};

function fakeSocket({ state = STATE, document = DOCUMENT } = {}) {
  return {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    timeout() { return this; },
    emit: vi.fn((event, payload, callback) => {
      if (event === "lyrics-get") callback?.(null, { ok: true, state, document: payload.includeDocument ? document : null });
      else callback?.(null, { ok: true, state });
    }),
  };
}

function renderTab(overrides = {}) {
  const socket = fakeSocket(overrides);
  const notify = vi.fn();
  const onLyricsPreferenceChange = vi.fn();
  render(
    <LyricsTab
      roomId="room-1"
      controllerKey="controller-key"
      socket={socket}
      isConnected
      currentVideo={{ queueId: "12", id: "abcdefghijk", title: "YOASOBI &quot;Yoru ni Kakeru&quot;" }}
      playback={{ state: "paused", positionSec: 2, durationSec: 200, roomLatencyMs: 21 }}
      settings={{ lyricsEnabled: true, lyricsPerUser: false }}
      lyricsPreference={false}
      onLyricsPreferenceChange={onLyricsPreferenceChange}
      notify={notify}
    />
  );
  return { socket, notify, onLyricsPreferenceChange };
}

const lyricsSets = (socket) => socket.emit.mock.calls.filter(([event]) => event === "lyrics-set").map(([, payload]) => payload);

afterEach(cleanup);

describe("controller lyrics tab", () => {
  it("shows the room's lyrics line by line with the sung line highlighted", async () => {
    renderTab();
    expect(screen.getByText('YOASOBI "Yoru ni Kakeru"')).toBeInTheDocument();
    const current = await screen.findByText("夜に駆ける");
    await waitFor(() => expect(current.closest("[aria-current]")).toHaveAttribute("aria-current", "true"));
    expect(screen.getByText("yoru ni kakeru")).toBeInTheDocument();
    expect(screen.getByText(/room ~21 ms/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Time-synced" }));
    await waitFor(() => expect(screen.getByText("夜に駆ける").closest("[aria-current]")).toBeNull());
    fireEvent.click(screen.getByRole("switch", { name: "Romaji" }));
    await waitFor(() => expect(screen.queryByText("yoru ni kakeru")).toBeNull());
  });

  it("switches the room's source and only offers sources that have lyrics", async () => {
    const user = userEvent.setup();
    const { socket } = renderTab();
    await screen.findByText("夜に駆ける");
    expect(screen.getByRole("button", { name: "YKT lyrics" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "NetEase lyrics" }));
    expect(lyricsSets(socket)).toEqual([{ roomId: "room-1", controllerKey: "controller-key", expectedQueueId: "12", source: "netease" }]);
  });

  it("nudges the offset with buttons or takes an exact whole number", async () => {
    const user = userEvent.setup();
    const { socket, notify } = renderTab();
    await screen.findByText("夜に駆ける");
    await user.click(screen.getByRole("button", { name: "Lyrics 100 ms later" }));
    await user.click(screen.getByRole("button", { name: "Lyrics 500 ms earlier" }));
    expect(lyricsSets(socket).map((payload) => payload.offsetMs)).toEqual([100, -400]);

    const field = screen.getByRole("textbox", { name: "Lyrics offset in milliseconds" });
    await user.clear(field);
    await user.type(field, "-1250{Enter}");
    expect(lyricsSets(socket).at(-1).offsetMs).toBe(-1250);

    await user.clear(field);
    await user.type(field, "1.5{Enter}");
    expect(notify).toHaveBeenCalledWith("Enter the offset as a whole number of milliseconds.", "error");
    expect(lyricsSets(socket)).toHaveLength(3);
  });

  it("lets a singer opt their own songs into the room display", async () => {
    const { onLyricsPreferenceChange } = renderTab();
    fireEvent.click(screen.getByRole("switch", { name: "Show lyrics on the room screen for songs I add" }));
    expect(onLyricsPreferenceChange).toHaveBeenCalledWith(true);
  });

  it("asks the server to look the song up even while the room display has lyrics off", () => {
    const { socket } = renderTab();
    expect(socket.emit).toHaveBeenCalledWith("lyrics-get", { roomId: "room-1", queueId: "12", lookup: true }, expect.any(Function));
  });

  it("explains when no lyrics were found and offers a different search", async () => {
    renderTab({ state: { ...STATE, status: "none", sources: [], source: null, revision: null }, document: null });
    expect(await screen.findByText(/No lyrics were found for this song/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search with different words" }));
    expect(await screen.findByRole("dialog", { name: "Lyrics match" })).toBeInTheDocument();
  });

  it("opens the match screen from the header", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Lyrics match details" }));
    const dialog = await screen.findByRole("dialog", { name: "Lyrics match" });
    expect(within(dialog).getByTestId("lyrics-match-video-title")).toHaveTextContent('YOASOBI "Yoru ni Kakeru"');
  });
});

describe("room lyrics overlay", () => {
  it("renders nothing until the room display is meant to show lyrics", () => {
    render(<LyricsOverlay state={{ ...STATE, display: false }} document={DOCUMENT} getPlaybackMs={() => 0} />);
    expect(screen.queryByTestId("lyrics-overlay")).toBeNull();
  });

  it("is hidden from assistive technology and passes pointer events through", () => {
    render(<LyricsOverlay state={STATE} document={DOCUMENT} getPlaybackMs={() => 2000} />);
    const overlay = screen.getByTestId("lyrics-overlay");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveClass("ytkt-lyrics-overlay");
  });

  it("says so when a song has no lyrics", () => {
    render(<LyricsOverlay state={{ ...STATE, status: "none", sources: [] }} document={null} getPlaybackMs={() => 0} />);
    expect(screen.getByText("No lyrics found for this song")).toBeInTheDocument();
  });
});

describe("room lyrics settings on the Controls tab", () => {
  it("turns lyrics on for the room and then per singer", () => {
    const socket = { timeout() { return this; }, emit: vi.fn((event, payload, callback) => callback?.(null, { ok: true })) };
    const setSettings = vi.fn();
    const { rerender } = render(
      <ControlsTab roomId="room-1" controllerKey="key" socket={socket} isConnected settings={{ roundRobinEnabled: false, lyricsEnabled: false }}
        setSettings={setSettings} currentVideo={null} playback={null} notify={vi.fn()} />
    );
    expect(screen.getByRole("switch", { name: "Only for singers who turn lyrics on" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Lyrics on the room screen" }));
    expect(socket.emit).toHaveBeenLastCalledWith("update-settings", { roomId: "room-1", controllerKey: "key", settings: { lyricsEnabled: true } }, expect.any(Function));
    expect(setSettings).toHaveBeenCalled();

    rerender(
      <ControlsTab roomId="room-1" controllerKey="key" socket={socket} isConnected settings={{ roundRobinEnabled: false, lyricsEnabled: true }}
        setSettings={setSettings} currentVideo={null} playback={null} notify={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("switch", { name: "Only for singers who turn lyrics on" }));
    expect(socket.emit).toHaveBeenLastCalledWith("update-settings", { roomId: "room-1", controllerKey: "key", settings: { lyricsPerUser: true } }, expect.any(Function));
  });
});

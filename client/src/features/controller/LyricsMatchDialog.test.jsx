import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LyricsMatchDialog from "./LyricsMatchDialog";

const DETAILS = {
  videoId: "abcdefghijk",
  durationSec: 219,
  status: "ready",
  searchTerms: null,
  searchPlan: [{ artist: "TOGENASHI TOGEARI", track: "Against All Answers" }, { artist: "", track: "Against All Answers" }],
  providers: ["lrclib", "netease"],
  lookup: { lrclib: { status: "found", at: 1 }, netease: { status: "not_found", at: 1 } },
  matches: [{ source: "lrclib", kind: "synced_line", track: "Other Song", artist: "Someone Else", durationSec: 180, confidence: 0.62, updatedAt: 1 }],
};

function fakeSocket({ details = DETAILS, searchResponse = { ok: true, found: [], outcomes: {} } } = {}) {
  return {
    connected: true,
    timeout() { return this; },
    emit: vi.fn((event, payload, callback) => {
      if (event === "lyrics-match") callback?.(null, { ok: true, details });
      else if (event === "lyrics-search") callback?.(null, searchResponse);
    }),
  };
}

function renderDialog(options = {}) {
  const socket = fakeSocket(options);
  const notify = vi.fn();
  render(
    <LyricsMatchDialog
      open
      onClose={vi.fn()}
      socket={socket}
      roomId="room-1"
      controllerKey="controller-key"
      isConnected
      currentVideo={{ queueId: "7", id: "abcdefghijk", title: "Against All Answers &amp; More", channelTitle: "TOGENASHI TOGEARI - Topic" }}
      state={{ source: "lrclib", status: "ready", revision: "abcdefghijk:lrclib:1" }}
      notify={notify}
    />
  );
  return { socket, notify };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lyrics match screen", () => {
  it("shows the YouTube title next to what each source matched", async () => {
    renderDialog();
    expect(screen.getByTestId("lyrics-match-video-title")).toHaveTextContent("Against All Answers & More");
    const lrclib = await screen.findByTestId("lyrics-match-lrclib");
    expect(within(lrclib).getByText("Other Song")).toBeInTheDocument();
    expect(within(lrclib).getByText(/Someone Else/)).toBeInTheDocument();
    expect(within(lrclib).getByText("Showing")).toBeInTheDocument();
    expect(within(lrclib).getByText("62% match")).toBeInTheDocument();
    expect(within(lrclib).getByText(/the video is 3:39, so this may be a different recording/)).toBeInTheDocument();
    expect(within(screen.getByTestId("lyrics-match-netease")).getByText("No match found")).toBeInTheDocument();
    expect(screen.getByText(/TOGENASHI TOGEARI — Against All Answers → “Against All Answers”/)).toBeInTheDocument();
  });

  it("copies the video title", async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { notify } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Copy video title" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Title copied.", "success"));
    expect(writeText).toHaveBeenCalledWith("Against All Answers & More");
  });

  it("starts from the last search and sends a corrected one", async () => {
    const user = userEvent.setup();
    const { socket } = renderDialog({
      searchResponse: { ok: true, found: ["lrclib", "netease"], outcomes: { lrclib: "found", netease: "found" }, details: DETAILS },
    });
    const artist = await screen.findByRole("textbox", { name: "Artist" });
    const track = screen.getByRole("textbox", { name: /Song title/ });
    await waitFor(() => expect(artist).toHaveValue("TOGENASHI TOGEARI"));
    expect(track).toHaveValue("Against All Answers");

    await user.clear(artist);
    await user.type(artist, "トゲナシトゲアリ");
    await user.click(screen.getByRole("button", { name: "Search again" }));
    expect(socket.emit).toHaveBeenCalledWith("lyrics-search", {
      roomId: "room-1", controllerKey: "controller-key", expectedQueueId: "7", artist: "トゲナシトゲアリ", track: "Against All Answers",
    }, expect.any(Function));
    expect(await screen.findByText(/Found on LRCLIB and NetEase/)).toBeInTheDocument();
  });

  it("says when a search found nothing and the lyrics were kept", async () => {
    const user = userEvent.setup();
    renderDialog({ searchResponse: { ok: true, found: [], outcomes: { lrclib: "error", netease: "not_found" } } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Song title/ })).toHaveValue("Against All Answers"));
    await user.click(screen.getByRole("button", { name: "Search again" }));
    expect(await screen.findByText(/lyrics were left as they were\. LRCLIB could not be reached/)).toBeInTheDocument();
  });
});

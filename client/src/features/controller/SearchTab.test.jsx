import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SearchTab from "./SearchTab";

function renderSearch({ roundRobinEnabled = false } = {}) {
  const socket = {
    timeout: vi.fn(function timeout() { return this; }),
    emit: vi.fn((event, payload, callback) => {
      callback?.(null, { ok: true, addedCount: 1, skippedCount: 0 });
    }),
  };
  const notify = vi.fn();
  render(
    <SearchTab
      roomId="room-1"
      controllerKey="controller-key"
      socket={socket}
      isConnected
      notify={notify}
      roundRobinEnabled={roundRobinEnabled}
    />
  );
  return { socket, notify };
}

async function searchForResult(user) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [{
        id: { videoId: "abcdefghijk" },
        snippet: {
          title: "Test Song",
          channelTitle: "Test Channel",
          thumbnails: { medium: { url: "https://example.test/thumb.jpg" } },
        },
      }],
    }),
  }));
  await user.type(screen.getByPlaceholderText("Search YouTube…"), "test song");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByText("Test Song");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("controller priority queue additions", () => {
  it("requires confirmation and sends the priority flag", async () => {
    const user = userEvent.setup();
    const { socket } = renderSearch();
    await searchForResult(user);

    await user.click(screen.getByRole("button", { name: "Add Test Song to top of queue" }));
    expect(socket.emit).not.toHaveBeenCalled();
    expect(screen.getByText(/top of the pending queue/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to top" }));
    expect(socket.emit).toHaveBeenCalledWith(
      "add-to-queue",
      expect.objectContaining({ addToTop: true, roomId: "room-1" }),
      expect.any(Function)
    );
  });

  it("explains personal ordering while round-robin is enabled", async () => {
    const user = userEvent.setup();
    renderSearch({ roundRobinEnabled: true });
    await searchForResult(user);

    await user.click(screen.getByRole("button", { name: "Add Test Song to top of queue" }));
    expect(screen.getByText(/top of your personal queue order/i)).toBeInTheDocument();
    expect(screen.getByText(/turn order will remain unchanged/i)).toBeInTheDocument();
  });
});

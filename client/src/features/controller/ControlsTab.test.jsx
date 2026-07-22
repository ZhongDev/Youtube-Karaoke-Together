import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ControlsTab from "./ControlsTab";

function renderControls() {
  const socket = {
    timeout: vi.fn(function timeout() { return this; }),
    emit: vi.fn((event, payload, callback) => callback?.(null, { ok: true })),
  };
  render(
    <ControlsTab
      roomId="room-1"
      username="Singer"
      controllerKey="controller-key"
      socket={socket}
      isConnected
      settings={{ roundRobinEnabled: false }}
      setSettings={vi.fn()}
      currentVideo={{ queueId: "12", id: "abcdefghijk", title: "Test Song" }}
      playback={{ state: "playing", positionSec: 30, durationSec: 120, volume: 64 }}
      notify={vi.fn()}
    />
  );
  return socket;
}

afterEach(cleanup);

describe("controller playback controls", () => {
  it("sends pause and relative seek commands for the current queue item", async () => {
    const user = userEvent.setup();
    const socket = renderControls();

    expect(screen.getByRole("slider", { name: "Seek playback timeline" })).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByRole("slider", { name: "Room volume" })).toHaveAttribute("aria-valuenow", "64");

    await user.click(screen.getByRole("button", { name: "Pause playback" }));
    expect(socket.emit).toHaveBeenCalledWith(
      "control-playback",
      expect.objectContaining({
        roomId: "room-1",
        command: { type: "pause", expectedQueueId: "12" },
      }),
      expect.any(Function)
    );

    await user.click(screen.getByRole("button", { name: "Seek forward 15 seconds" }));
    expect(socket.emit).toHaveBeenCalledWith(
      "control-playback",
      expect.objectContaining({
        command: { type: "seek", positionSec: 45, expectedQueueId: "12" },
      }),
      expect.any(Function)
    );
  });

  it("commits timeline and volume slider commands", () => {
    const socket = renderControls();
    const timeline = screen.getByRole("slider", { name: "Seek playback timeline" });
    fireEvent.change(timeline, { target: { value: "75" } });
    fireEvent.mouseUp(timeline);
    expect(socket.emit).toHaveBeenCalledWith(
      "control-playback",
      expect.objectContaining({
        command: { type: "seek", positionSec: 75, expectedQueueId: "12" },
      }),
      expect.any(Function)
    );

    const volume = screen.getByRole("slider", { name: "Room volume" });
    fireEvent.change(volume, { target: { value: "40" } });
    expect(volume).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getAllByText("40%")).toHaveLength(2);
    fireEvent.mouseUp(volume);
    expect(socket.emit).toHaveBeenCalledWith(
      "control-playback",
      expect.objectContaining({ command: { type: "volume", volume: 40 } }),
      expect.any(Function)
    );
  });

  it("opens the current time for exact entry and rejects times beyond the video", async () => {
    const user = userEvent.setup();
    const socket = renderControls();

    await user.click(screen.getByRole("button", { name: "Enter exact playback time" }));
    expect(screen.getByRole("dialog", { name: "Seek to exact time" })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Playback time" });
    expect(input).toHaveValue("00:30.000");

    await user.clear(input);
    await user.type(input, "02:00.001");
    await user.click(screen.getByRole("button", { name: "Seek" }));
    expect(screen.getByText("Time must not exceed 02:00.000.")).toBeInTheDocument();
    expect(socket.emit).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "01:15.250");
    await user.click(screen.getByRole("button", { name: "Seek" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Seek to exact time" })).not.toBeInTheDocument();
    });
    expect(socket.emit).toHaveBeenCalledWith(
      "control-playback",
      expect.objectContaining({
        command: { type: "seek", positionSec: 75.25, expectedQueueId: "12" },
      }),
      expect.any(Function)
    );
  });
});

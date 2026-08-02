import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../config";
import { USERNAME_CHANGED_EVENT } from "../features/controller/usernameSync";
import Settings from "./Settings.jsx";

const mocks = vi.hoisted(() => ({ renameController: vi.fn() }));

vi.mock("../hooks/useSocket", () => ({
  default: () => ({ socket: {}, isConnected: true, renameController: mocks.renameController }),
}));

function renderSettings() {
  render(
    <MemoryRouter initialEntries={["/control/room-1"]}>
      <Routes>
        <Route
          path="/control/:roomId"
          element={
            <Settings
              queueColorsEnabled
              bgColorEnabled
              lyricsRomajiEnabled={false}
              onToggleQueueColors={vi.fn()}
              onToggleBgColor={vi.fn()}
              onToggleLyricsRomaji={vi.fn()}
              colorHue={null}
              onColorChange={vi.fn()}
              onColorCommit={vi.fn()}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function registerController() {
  localStorage.setItem(`${STORAGE_KEYS.CONTROLLER_KEY_PREFIX}room-1`, "controller-key");
}

afterEach(cleanup);

describe("controller display name settings", () => {
  it("keeps the saved name in the field when Remember me is off", async () => {
    const user = userEvent.setup();
    registerController();
    sessionStorage.setItem(STORAGE_KEYS.SESSION_USERNAME, "Singer");
    mocks.renameController.mockResolvedValue({ username: "Singer" });
    renderSettings();

    const field = screen.getByRole("textbox", { name: "Your Name" });
    expect(field).toHaveValue("Singer");

    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    await screen.findByText("Settings saved successfully!");

    // The preference lives in sessionStorage when Remember me is off, so a
    // listener reading localStorage would blank the field it just saved.
    expect(field).toHaveValue("Singer");
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_USERNAME)).toBe("Singer");
  });

  it("shows the server-assigned name while storing the plain preference", async () => {
    const user = userEvent.setup();
    registerController();
    localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
    localStorage.setItem(STORAGE_KEYS.USERNAME, "Singer");
    mocks.renameController.mockResolvedValue({ username: "Singer [2]" });
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    await screen.findByText("Settings saved successfully!");

    // The room resolved a name collision, so the field must show the name the
    // server actually assigned while the stored preference stays unsuffixed.
    expect(screen.getByRole("textbox", { name: "Your Name" })).toHaveValue("Singer [2]");
    expect(localStorage.getItem(STORAGE_KEYS.USERNAME)).toBe("Singer");
  });

  it("announces the server-assigned name to sibling components", async () => {
    const user = userEvent.setup();
    registerController();
    sessionStorage.setItem(STORAGE_KEYS.SESSION_USERNAME, "Singer");
    mocks.renameController.mockResolvedValue({ username: "Singer [2]" });
    const announced = [];
    const listener = (event) => announced.push(event.detail?.username);
    window.addEventListener(USERNAME_CHANGED_EVENT, listener);
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Save Settings" }));
    await screen.findByText("Settings saved successfully!");
    window.removeEventListener(USERNAME_CHANGED_EVENT, listener);

    expect(announced).toEqual(["Singer [2]"]);
  });
});

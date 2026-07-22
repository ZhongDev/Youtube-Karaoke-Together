import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, getStoredPreferredUsername, normalizeStoredUsername, STORAGE_KEYS, storePreferredUsername } from "./config";

describe("client normalization", () => {
  it("decodes YouTube HTML entities at display boundaries", () => {
    expect(decodeHtmlEntities("Rock &amp; Roll &#39;Live&#39;")).toBe("Rock & Roll 'Live'");
    expect(decodeHtmlEntities("Nested &amp;amp; value")).toBe("Nested &amp; value");
    expect(decodeHtmlEntities("AT&T and a literal &definitelyNotAnEntity;")).toBe("AT&T and a literal &definitelyNotAnEntity;");
    expect(decodeHtmlEntities("Plain title")).toBe("Plain title");
  });

  it("does not repeatedly normalize stored collision suffixes", () => {
    expect(normalizeStoredUsername("Singer [2]")).toBe("Singer");
    expect(normalizeStoredUsername("Singer")).toBe("Singer");
  });

  it("keeps an unchecked username session-only and removes older persistent values", () => {
    localStorage.setItem(STORAGE_KEYS.USERNAME, "Old name");
    localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
    storePreferredUsername("Current name", false);
    expect(localStorage.getItem(STORAGE_KEYS.USERNAME)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REMEMBER_ME)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_USERNAME)).toBe("Current name");
    expect(getStoredPreferredUsername()).toBe("Current name");
  });

  it("persists a remembered username and clears the session copy", () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_USERNAME, "Session name");
    storePreferredUsername("Remembered name", true);
    expect(localStorage.getItem(STORAGE_KEYS.USERNAME)).toBe("Remembered name");
    expect(localStorage.getItem(STORAGE_KEYS.REMEMBER_ME)).toBe("true");
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_USERNAME)).toBeNull();
  });
});

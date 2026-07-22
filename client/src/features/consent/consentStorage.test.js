import { describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_POLICY_VERSION, STORAGE_KEYS } from "../../config";
import { acceptPrivacyUpdate, getHomepageConsentState, persistCurrentConsent } from "./consentStorage";

describe("homepage consent migration", () => {
  it("shows the updated policy once to a legacy persistent Terms browser", () => {
    localStorage.setItem(STORAGE_KEYS.TOS_ACCEPTED, "true");
    expect(getHomepageConsentState()).toEqual({ termsAccepted: false, showTerms: false, showPrivacyUpdate: true });
    acceptPrivacyUpdate();
    expect(getHomepageConsentState()).toEqual({ termsAccepted: true, showTerms: false, showPrivacyUpdate: false });
  });

  it("shows only the normal Terms flow without the legacy flag", () => {
    expect(getHomepageConsentState()).toEqual({ termsAccepted: false, showTerms: true, showPrivacyUpdate: false });
  });

  it("writes both markers for a new persistent acceptance", () => {
    persistCurrentConsent();
    expect(localStorage.getItem(STORAGE_KEYS.TOS_ACCEPTED)).toBe("true");
    expect(localStorage.getItem(STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION)).toBe(CURRENT_PRIVACY_POLICY_VERSION);
  });

  it("prompts again when the accepted version differs", () => {
    localStorage.setItem(STORAGE_KEYS.TOS_ACCEPTED, "true");
    localStorage.setItem(STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION, "2025-06-20");
    expect(getHomepageConsentState().showPrivacyUpdate).toBe(true);
  });

  it("fails closed when storage cannot be read", () => {
    const brokenStorage = { getItem() { throw new Error("blocked"); } };
    expect(getHomepageConsentState(brokenStorage)).toEqual({ termsAccepted: false, showTerms: true, showPrivacyUpdate: false });
  });
});

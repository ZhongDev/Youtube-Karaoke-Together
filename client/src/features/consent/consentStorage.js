import { CURRENT_PRIVACY_POLICY_VERSION, STORAGE_KEYS } from "../../config";

export function getHomepageConsentState(storage = window.localStorage) {
  try {
    const persistentTerms = storage.getItem(STORAGE_KEYS.TOS_ACCEPTED) === "true";
    const acceptedPrivacyVersion = storage.getItem(
      STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION,
    );
    if (!persistentTerms) {
      return { termsAccepted: false, showTerms: true, showPrivacyUpdate: false };
    }
    if (acceptedPrivacyVersion !== CURRENT_PRIVACY_POLICY_VERSION) {
      return { termsAccepted: false, showTerms: false, showPrivacyUpdate: true };
    }
    return { termsAccepted: true, showTerms: false, showPrivacyUpdate: false };
  } catch {
    return { termsAccepted: false, showTerms: true, showPrivacyUpdate: false };
  }
}

export function persistCurrentConsent(storage = window.localStorage) {
  storage.setItem(STORAGE_KEYS.TOS_ACCEPTED, "true");
  storage.setItem(
    STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION,
    CURRENT_PRIVACY_POLICY_VERSION,
  );
}

export function acceptPrivacyUpdate(storage = window.localStorage) {
  storage.setItem(
    STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION,
    CURRENT_PRIVACY_POLICY_VERSION,
  );
}

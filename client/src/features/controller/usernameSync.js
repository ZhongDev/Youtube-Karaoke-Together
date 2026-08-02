export const USERNAME_CHANGED_EVENT = "ytkt:username-changed";

/**
 * Same-window channel for controller display-name changes.
 *
 * `storage` events cannot carry this: they only fire in *other* tabs, and the
 * value they carry is the stored preference, which is deliberately normalized
 * and therefore never includes the room collision suffix the server may have
 * appended. Components that need the name actually in effect subscribe here.
 */
export function announceUsername(username) {
    if (typeof username !== "string" || !username) return false;
    window.dispatchEvent(new CustomEvent(USERNAME_CHANGED_EVENT, { detail: { username } }));
    return true;
}

export function subscribeToUsername(handler) {
    const listener = (event) => {
        const username = event.detail?.username;
        if (typeof username === "string" && username) handler(username);
    };
    window.addEventListener(USERNAME_CHANGED_EVENT, listener);
    return () => window.removeEventListener(USERNAME_CHANGED_EVENT, listener);
}

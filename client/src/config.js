/**
 * Configuration utility for YouTube Karaoke Together
 * 
 * In production: Uses window.location for frontend origin, /ws/ path for Socket.IO
 * In development: Uses Vite env vars for explicit backend configuration
 */

import privacyPolicy from '../../policy.json';

// Check if we're in development mode
const isDev = import.meta.env.VITE_DEV === 'true' || import.meta.env.DEV;

/**
 * Get the backend API URL
 * - Dev: Uses VITE_BACKEND_URL or falls back to localhost:8080
 * - Prod: Uses same origin as frontend
 */
export function getBackendUrl() {
    if (isDev) {
        return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
    }
    return window.location.origin;
}

/**
 * Get Socket.IO connection options
 * - Dev: Connect to backend URL directly with default path
 * - Prod: Connect to same origin with /ws/ path
 */
export function getSocketConfig() {
    if (isDev) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
        return {
            url: backendUrl,
            options: {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: Infinity,
                timeout: 20000,
            }
        };
    }

    // Production: same origin, /ws/ path
    return {
        url: window.location.origin,
        options: {
            path: '/ws/',
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: Infinity,
            timeout: 20000,
        }
    };
}

/**
 * Get the frontend origin (for display purposes)
 */
export function getFrontendOrigin() {
    return window.location.origin;
}

/**
 * Check if running in development mode
 */
export function isDevMode() {
    return isDev;
}

// Storage keys
export const STORAGE_KEYS = {
    CONTROLLER_KEY_PREFIX: 'ytkt_controllerKey_',
    PLAYER_KEY_PREFIX: 'ytkt_playerKey_',
    USERNAME: 'karaokeUsername',
    SESSION_USERNAME: 'karaokeSessionUsername',
    REMEMBER_ME: 'karaokeRememberMe',
    TOS_ACCEPTED: 'tosDoNotAsk',
    PRIVACY_POLICY_ACCEPTED_VERSION: 'ytkt_privacyPolicyAcceptedVersion',
    REGISTRATION_TOKEN_PREFIX: 'ytkt_registrationToken_',
    QUEUE_COLORS_ENABLED: 'ytkt_queueColorsEnabled',
    BG_COLOR_ENABLED: 'ytkt_bgColorEnabled',
    ROOM_QUEUE_COLORS_ENABLED: 'ytkt_roomQueueColorsEnabled',
    LYRICS_ROMAJI_ENABLED: 'ytkt_lyricsRomajiEnabled',
};

// Read from the repository-root policy.json that the server also loads, so a
// version bump cannot land on one side only. Asserting a version the server does
// not recognise makes room creation return 428 and blocks controller
// registration, which is silent until someone tries to create a room.
export const CURRENT_PRIVACY_POLICY_VERSION = privacyPolicy.privacyPolicyVersion;

/**
 * Decode HTML entity references in a string. Safe for use on values like
 * YouTube video titles, which the Data API v3 returns with entities still
 * encoded (e.g. `&#39;`, `&amp;`, `&quot;`). Idempotent — strings without
 * `&` are returned as-is. Uses a detached <textarea> so the browser handles
 * all named/decimal/hex entities without any HTML being parsed as markup.
 */
export function decodeHtmlEntities(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    if (text.indexOf('&') === -1) return text;
    if (typeof document === 'undefined') return text;
    const ta = document.createElement('textarea');
    ta.innerHTML = text;
    return ta.value;
}

/**
 * Normalize a preferred username stored in localStorage.
 * Removes room collision suffixes like "Name [2]" and strips bracket chars.
 */
export function normalizeStoredUsername(name) {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    const withoutCollisionSuffix = trimmed.replace(/\s\[\d+\]$/, '');
    return withoutCollisionSuffix.replace(/[\[\]]/g, '').trim();
}

/**
 * Get stored preferred username and auto-heal legacy suffixed values.
 */
export function getStoredPreferredUsername() {
    const remember = localStorage.getItem(STORAGE_KEYS.REMEMBER_ME) === 'true';
    const storage = remember ? localStorage : sessionStorage;
    const key = remember ? STORAGE_KEYS.USERNAME : STORAGE_KEYS.SESSION_USERNAME;
    const raw = storage.getItem(key) || '';
    const normalized = normalizeStoredUsername(raw);
    if (raw !== normalized) {
        storage.setItem(key, normalized);
    }
    return normalized;
}

export function storePreferredUsername(name, remember) {
    const normalized = normalizeStoredUsername(name);
    if (remember) {
        localStorage.setItem(STORAGE_KEYS.USERNAME, normalized);
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
        sessionStorage.removeItem(STORAGE_KEYS.SESSION_USERNAME);
    } else {
        localStorage.removeItem(STORAGE_KEYS.USERNAME);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_USERNAME, normalized);
    }
    return normalized;
}

/**
 * Get stored controller key for a room
 */
export function getStoredControllerKey(roomId) {
    return localStorage.getItem(`${STORAGE_KEYS.CONTROLLER_KEY_PREFIX}${roomId}`);
}

/**
 * Store controller key for a room
 */
export function storeControllerKey(roomId, key) {
    localStorage.setItem(`${STORAGE_KEYS.CONTROLLER_KEY_PREFIX}${roomId}`, key);
}

/**
 * Remove stored controller key for a room
 */
export function removeControllerKey(roomId) {
    localStorage.removeItem(`${STORAGE_KEYS.CONTROLLER_KEY_PREFIX}${roomId}`);
}

/**
 * Get stored player key for a room
 */
export function getStoredPlayerKey(roomId) {
    return localStorage.getItem(`${STORAGE_KEYS.PLAYER_KEY_PREFIX}${roomId}`);
}

/**
 * Store player key for a room
 */
export function storePlayerKey(roomId, key) {
    localStorage.setItem(`${STORAGE_KEYS.PLAYER_KEY_PREFIX}${roomId}`, key);
}

/**
 * Remove stored player key for a room
 */
export function removePlayerKey(roomId) {
    localStorage.removeItem(`${STORAGE_KEYS.PLAYER_KEY_PREFIX}${roomId}`);
}

export default {
    getBackendUrl,
    getSocketConfig,
    getFrontendOrigin,
    isDevMode,
    STORAGE_KEYS,
    decodeHtmlEntities,
    normalizeStoredUsername,
    getStoredPreferredUsername,
    storePreferredUsername,
    getStoredControllerKey,
    storeControllerKey,
    removeControllerKey,
    getStoredPlayerKey,
    storePlayerKey,
    removePlayerKey,
};

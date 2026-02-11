/**
 * Configuration utility for YouTube Karaoke Together
 * 
 * In production: Uses window.location for frontend origin, /ws/ path for Socket.IO
 * In development: Uses Vite env vars for explicit backend configuration
 */

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
    REMEMBER_ME: 'karaokeRememberMe',
    TOS_ACCEPTED: 'tosDoNotAsk',
    QUEUE_COLORS_ENABLED: 'ytkt_queueColorsEnabled',
    BG_COLOR_ENABLED: 'ytkt_bgColorEnabled',
    ROOM_QUEUE_COLORS_ENABLED: 'ytkt_roomQueueColorsEnabled',
};

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
    const raw = localStorage.getItem(STORAGE_KEYS.USERNAME) || '';
    const normalized = normalizeStoredUsername(raw);
    if (raw !== normalized) {
        localStorage.setItem(STORAGE_KEYS.USERNAME, normalized);
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
    normalizeStoredUsername,
    getStoredPreferredUsername,
    getStoredControllerKey,
    storeControllerKey,
    removeControllerKey,
    getStoredPlayerKey,
    storePlayerKey,
    removePlayerKey,
};

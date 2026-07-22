const crypto = require('crypto');

function generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function tokenDigest(token, pepper = '') {
    return crypto.createHash('sha256').update(`${pepper}:${String(token || '')}`).digest('hex');
}

function constantTimeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseBearer(value) {
    if (typeof value !== 'string') return '';
    const match = /^Bearer\s+(.+)$/i.exec(value.trim());
    return match ? match[1] : '';
}

function parseCookies(header = '') {
    const cookies = {};
    for (const part of String(header).split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1) continue;
        try {
            cookies[decodeURIComponent(part.slice(0, separator).trim())] = decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            // Ignore malformed cookie fields.
        }
    }
    return cookies;
}

function sessionCookie(value, { secure = false, maxAgeSeconds = 0 } = {}) {
    const fields = [
        `ytkt_admin_session=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (secure) fields.push('Secure');
    if (maxAgeSeconds > 0) fields.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
    if (maxAgeSeconds === 0 && value === '') fields.push('Max-Age=0');
    return fields.join('; ');
}

function csrfCookie(value, { secure = false, maxAgeSeconds = 0 } = {}) {
    const fields = [
        `ytkt_admin_csrf=${encodeURIComponent(value)}`,
        'Path=/',
        'SameSite=Lax',
    ];
    if (secure) fields.push('Secure');
    if (maxAgeSeconds > 0) fields.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
    if (maxAgeSeconds === 0 && value === '') fields.push('Max-Age=0');
    return fields.join('; ');
}

function asObject(payload) {
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

function cleanText(value, maxLength = 200) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function isIdentifier(value, maxLength = 128) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_:\-.]+$/.test(value);
}

class AppError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.status = status;
    }
}

module.exports = {
    AppError,
    asObject,
    cleanText,
    constantTimeEqual,
    csrfCookie,
    generateToken,
    isIdentifier,
    parseBearer,
    parseCookies,
    sessionCookie,
    tokenDigest,
};

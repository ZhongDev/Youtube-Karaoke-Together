const fs = require('fs');
const path = require('path');

const DEFAULT_LIMITS = Object.freeze({
    maxRooms: 5000,
    maxControllersPerRoom: 500,
    maxQueueLengthPerRoom: 1000,
    maxPlaylistItemsPerAdd: 50,
    maxUsernameLength: 50,
    maxVideoTitleLength: 200,
    maxVideoIdLength: 128,
    maxSearchQueryLength: 200,
    maxHttpBufferSize: 64 * 1024,
    maxSocketEventsPerMinute: 240,
    maxPlaylistAddsPerMinute: 5,
    maxVideoAddsPerMinute: 30,
});

function readLimits(configPath, logger = console) {
    const limits = { ...DEFAULT_LIMITS };
    try {
        if (!fs.existsSync(configPath)) return limits;
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
            const value = parsed[key];
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                limits[key] = Math.floor(value);
            } else if (value !== undefined) {
                logger.warn(`[WARN] Ignoring invalid limit ${key}; using ${fallback}.`);
            }
        }
    } catch (error) {
        logger.warn(`[WARN] Failed to load limits from ${configPath}: ${error.message}`);
    }
    return limits;
}

function normalizeOrigin(value) {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function loadConfig(overrides = {}, logger = console) {
    const rootDir = overrides.rootDir || path.resolve(__dirname, '../..');
    const nodeEnv = overrides.nodeEnv || process.env.NODE_ENV || 'development';
    const publicFrontendOrigin = normalizeOrigin(
        overrides.publicFrontendOrigin || process.env.PUBLIC_FRONTEND_ORIGIN || 'http://localhost:3000'
    );
    if (!publicFrontendOrigin) throw new Error('PUBLIC_FRONTEND_ORIGIN must be a valid origin');

    const limitsConfigPath = overrides.limitsConfigPath || process.env.LIMITS_CONFIG_PATH || path.join(rootDir, 'server-limits.json');
    const configuredOrigins = String(overrides.allowedOrigins || process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((entry) => normalizeOrigin(entry.trim()))
        .filter(Boolean);
    const allowedOrigins = new Set([publicFrontendOrigin, ...configuredOrigins]);
    if (nodeEnv === 'development' || nodeEnv === 'test') {
        for (const origin of [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
        ]) allowedOrigins.add(origin);
    }

    const tokenPepper = overrides.tokenPepper ?? process.env.TOKEN_PEPPER ?? '';
    if (nodeEnv === 'production' && tokenPepper.length < 32) {
        throw new Error('TOKEN_PEPPER must contain at least 32 characters in production');
    }

    return {
        rootDir,
        nodeEnv,
        port: Number(overrides.port ?? process.env.PORT) || 8080,
        publicFrontendOrigin,
        allowedOrigins,
        limitsConfigPath,
        limits: overrides.limits || readLimits(limitsConfigPath, logger),
        databasePath: overrides.databasePath || process.env.DATABASE_PATH || path.join(rootDir, 'data', 'youtube-karaoke.sqlite'),
        backupDir: overrides.backupDir || process.env.BACKUP_DIR || path.join(rootDir, 'backups'),
        automaticBackups: overrides.automaticBackups ?? (process.env.AUTO_BACKUPS ? process.env.AUTO_BACKUPS === 'true' : nodeEnv === 'production'),
        backupIntervalMs: Number(overrides.backupIntervalMs) || 24 * 60 * 60 * 1000,
        backupRetentionMs: Number(overrides.backupRetentionMs) || 24 * 60 * 60 * 1000,
        youtubeApiKey: overrides.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? '',
        youtubeApiKeyAlias: overrides.youtubeApiKeyAlias || process.env.YOUTUBE_API_KEY_ALIAS || 'default',
        googleClientId: overrides.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? '',
        currentPrivacyPolicyVersion: overrides.currentPrivacyPolicyVersion || '2026-07-21',
        tokenPepper,
        inactivityMs: Number(overrides.inactivityMs ?? process.env.ROOM_INACTIVITY_HOURS) > 0
            ? Number(overrides.inactivityMs ?? process.env.ROOM_INACTIVITY_HOURS) * (overrides.inactivityMs ? 1 : 60 * 60 * 1000)
            : 24 * 60 * 60 * 1000,
        historyRetentionMs: Math.min(Number(overrides.historyRetentionMs) || 28 * 24 * 60 * 60 * 1000, 28 * 24 * 60 * 60 * 1000),
        inviteTtlMs: Number(overrides.inviteTtlMs) || 30 * 60 * 1000,
        adminSessionTtlMs: Number(overrides.adminSessionTtlMs) || 12 * 60 * 60 * 1000,
        bootstrapTtlMs: Number(overrides.bootstrapTtlMs) || 15 * 60 * 1000,
        playbackCheckpointMs: Number(overrides.playbackCheckpointMs) || 5000,
        maintenanceIntervalMs: Number(overrides.maintenanceIntervalMs) || 60 * 60 * 1000,
        socketPath: nodeEnv === 'production' ? '/ws/' : '/socket.io/',
        secureCookies: overrides.secureCookies ?? nodeEnv === 'production',
    };
}

module.exports = { DEFAULT_LIMITS, loadConfig, normalizeOrigin, readLimits };

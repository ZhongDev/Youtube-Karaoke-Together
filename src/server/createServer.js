const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { version } = require('../../package.json');
const { AdminService } = require('./adminService');
const { AppDatabase } = require('./database');
const { RoomService } = require('./roomService');
const { registerSocketHandlers } = require('./socketHandlers');
const {
    AppError,
    csrfCookie,
    parseBearer,
    sessionCookie,
} = require('./security');
const { YouTubeService } = require('./youtubeService');

const BACKUP_FILE_PATTERN = /^youtube-karaoke-.*\.sqlite$/;

function numericQuery(value, fallback, max = 100) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : fallback;
}

function buildControlUrl(config, roomId, registrationToken) {
    return `${config.publicFrontendOrigin}/control/${roomId}#token=${encodeURIComponent(registrationToken)}`;
}

function createServer({ config, logger = console, database = null, fetchImpl = fetch, verifyGoogleToken = null } = {}) {
    if (!config) throw new Error('config is required');
    const db = database || new AppDatabase(config.databasePath, { logger });
    const roomService = new RoomService({ db, config, logger });
    const youtubeService = new YouTubeService({ db, config, logger, fetchImpl });
    const adminService = new AdminService({ db, config, logger, verifyGoogleToken });
    const app = express();
    const httpServer = http.createServer(app);

    const originAllowed = (origin) => !origin || config.allowedOrigins.has(origin);
    const corsOptions = {
        origin(origin, callback) {
            if (originAllowed(origin)) return callback(null, true);
            logger.warn(`[WARN] CORS blocked origin: ${origin}`);
            return callback(new AppError('cors_blocked', 'Origin is not allowed', 403));
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Privacy-Policy-Version'],
        credentials: true,
    };

    app.disable('x-powered-by');
    app.set('trust proxy', 'loopback');
    app.use(helmet({
        referrerPolicy: { policy: 'no-referrer' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://accounts.google.com', 'https://www.youtube.com', 'https://s.ytimg.com'],
                frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
                connectSrc: ["'self'", 'https://accounts.google.com', 'https://www.googleapis.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
    }));
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '100kb' }));
    app.use((req, res, next) => {
        const started = Date.now();
        res.on('finish', () => logger.info(`[${res.statusCode >= 400 ? 'WARN' : 'INFO'}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`));
        next();
    });

    const searchLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
    const createLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
    const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    const adminRoute = (options, handler) => asyncRoute(async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const admin = adminService.authenticate(req, options);
        await handler(req, res, admin);
    });

    app.get('/api/health', (req, res) => res.json({ ok: true, version }));
    app.get('/api/ready', (req, res) => db.health() ? res.json({ ok: true }) : res.status(503).json({ ok: false }));

    app.post('/api/rooms', createLimiter, asyncRoute(async (req, res) => {
        if (req.get('X-Privacy-Policy-Version') !== config.currentPrivacyPolicyVersion) {
            throw new AppError('policy_acceptance_required', 'Accept the current Privacy Policy before creating a room', 428);
        }
        const { room, playerKey } = roomService.createRoom({ issueRegistrationInvite: false });
        db.recordPolicyAcceptance({
            anonymousIdHash: roomService.digest(`room:${room.id}`),
            roomId: room.id,
            policyType: 'privacy',
            policyVersion: config.currentPrivacyPolicyVersion,
        });
        res.status(201).json({ roomId: room.id, playerKey });
    }));

    app.get('/api/rooms/:roomId', (req, res, next) => {
        try { res.json(roomService.publicState(roomService.requireRoom(req.params.roomId))); } catch (error) { next(error); }
    });

    app.get('/api/rooms/:roomId/qr', asyncRoute(async (req, res) => {
        const room = roomService.requireRoom(req.params.roomId);
        roomService.validatePlayer(room, parseBearer(req.headers.authorization));
        const invite = roomService.createRegistrationInvite(room.id);
        const controlUrl = buildControlUrl(config, room.id, invite.token);
        const qrCode = await QRCode.toDataURL(controlUrl);
        res.json({ qrCode, controlUrl, expiresAt: invite.expiresAt });
    }));

    app.delete('/api/rooms/:roomId/data', createLimiter, asyncRoute(async (req, res) => {
        const roomId = req.params.roomId;
        if (req.body?.confirmation !== roomId) {
            throw new AppError('confirmation_required', 'Enter the full room ID to confirm deletion');
        }
        const room = roomService.requireRoom(roomId);
        roomService.validatePlayer(room, parseBearer(req.headers.authorization));
        io.to(room.id).emit('room-closed', { roomId: room.id, reason: 'deleted_by_creator' });
        roomService.deleteRoomData(room.id, parseBearer(req.headers.authorization));
        io.in(room.id).socketsLeave(room.id);
        io.in(`${room.id}:player-admin`).socketsLeave(`${room.id}:player-admin`);
        res.status(204).end();
    }));

    app.get('/api/search', searchLimiter, asyncRoute(async (req, res) => {
        const auth = roomService.authorizeSearch(req.query.roomId, parseBearer(req.headers.authorization));
        if (!auth) throw new AppError('unauthorized', 'A valid controller key is required', 401);
        roomService.touchAuthenticated(auth.room);
        const data = await youtubeService.search(req.query.query, req.query.pageToken, auth.room.id);
        res.json(data);
    }));

    app.get('/api/admin/bootstrap/status', loginLimiter, (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ bootstrapRequired: db.ownerCount() === 0, googleConfigured: Boolean(config.googleClientId) });
    });

    app.post('/api/admin/login/google', loginLimiter, asyncRoute(async (req, res) => {
        let result;
        try {
            result = await adminService.loginWithGoogle(req.body || {});
        } catch (error) {
            db.audit(null, 'login_failed', 'admin_identity', null, { provider: 'google', code: error.code || 'verification_failed' });
            throw error;
        }
        const maxAge = Math.floor(config.adminSessionTtlMs / 1000);
        res.setHeader('Set-Cookie', [
            sessionCookie(result.token, { secure: config.secureCookies, maxAgeSeconds: maxAge }),
            csrfCookie(result.csrfToken, { secure: config.secureCookies, maxAgeSeconds: maxAge }),
        ]);
        res.set('Cache-Control', 'no-store');
        res.json({ user: result.user, expiresAt: result.expiresAt, csrfToken: result.csrfToken });
    }));

    app.get('/api/admin/session', adminRoute({ role: 'viewer' }, async (req, res, admin) => {
        res.json({ user: adminService.publicUser(admin), expiresAt: admin.expires_at });
    }));

    app.post('/api/admin/logout', adminRoute({ role: 'viewer', csrf: true }, async (req, res) => {
        adminService.logout(req);
        res.setHeader('Set-Cookie', [
            sessionCookie('', { secure: config.secureCookies }),
            csrfCookie('', { secure: config.secureCookies }),
        ]);
        res.status(204).end();
    }));

    app.get('/api/admin/rooms', adminRoute({ role: 'viewer' }, async (req, res) => {
        const result = db.listRooms({ status: 'active', limit: numericQuery(req.query.limit, 50), offset: numericQuery(req.query.offset, 0, 1_000_000) });
        result.rows = result.rows.map((room) => ({
            ...room,
            connected: roomService.connectionCounts(room.id),
            controllers: roomService.controllerCounts(room.id),
        }));
        res.json(result);
    }));

    app.get('/api/admin/history', adminRoute({ role: 'viewer' }, async (req, res) => {
        const from = req.query.from ? Date.parse(req.query.from) : Date.now() - config.historyRetentionMs;
        const to = req.query.to ? Date.parse(req.query.to) : Date.now();
        if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 31 * 24 * 60 * 60 * 1000) {
            throw new AppError('invalid_date_range', 'History range must be valid and no longer than 31 days');
        }
        res.json(db.listRooms({ status: 'closed', from, to, limit: numericQuery(req.query.limit, 50), offset: numericQuery(req.query.offset, 0, 1_000_000) }));
    }));

    app.get('/api/admin/rooms/:roomId', adminRoute({ role: 'viewer' }, async (req, res) => {
        const detail = db.roomDetail(req.params.roomId);
        if (!detail) throw new AppError('room_not_found', 'Room not found', 404);
        if (detail.status === 'active') {
            detail.connected = roomService.connectionCounts(detail.id);
            detail.controllers = roomService.controllerCounts(detail.id);
        }
        res.json(detail);
    }));

    app.get('/api/admin/usage', adminRoute({ role: 'viewer' }, async (req, res) => {
        res.json(youtubeService.usageSummary(numericQuery(req.query.days, 30, 30)));
    }));

    app.patch('/api/admin/usage/limits', adminRoute({ role: 'admin', csrf: true }, async (req, res, admin) => {
        res.json(youtubeService.updateQuotaLimits(req.body?.limits, admin.admin_user_id));
    }));

    app.get('/api/admin/users', adminRoute({ role: 'owner' }, async (req, res) => {
        res.json({ users: db.listAdmins().map((user) => adminService.publicUser(user)) });
    }));

    app.post('/api/admin/invites', adminRoute({ role: 'owner', csrf: true, recentAuth: true }, async (req, res, admin) => {
        res.status(201).json(adminService.createInvite(admin, req.body || {}));
    }));

    app.patch('/api/admin/users/:userId', adminRoute({ role: 'owner', csrf: true, recentAuth: true }, async (req, res, admin) => {
        const update = req.body || {};
        if (update.role !== undefined && !['owner', 'admin', 'viewer'].includes(update.role)) throw new AppError('invalid_role', 'Invalid administrator role');
        if (update.enabled !== undefined && typeof update.enabled !== 'boolean') throw new AppError('invalid_status', 'Administrator enabled state must be a boolean');
        const updated = db.updateAdmin(req.params.userId, update, admin.admin_user_id);
        if (!updated) throw new AppError('admin_not_found', 'Administrator not found', 404);
        res.json({ user: adminService.publicUser(updated) });
    }));

    app.get('/api/admin/users/:userId/sessions', adminRoute({ role: 'owner' }, async (req, res) => {
        res.json({ sessions: db.listAdminSessions(req.params.userId) });
    }));

    app.delete('/api/admin/users/:userId/sessions', adminRoute({ role: 'owner', csrf: true, recentAuth: true }, async (req, res, admin) => {
        const revoked = db.revokeAllAdminSessions(req.params.userId);
        db.audit(admin.admin_user_id, 'admin_sessions_revoked', 'admin_user', req.params.userId, { revoked });
        res.json({ revoked });
    }));

    app.get('/api/admin/audit', adminRoute({ role: 'owner' }, async (req, res) => {
        res.json(db.listAudit({ limit: numericQuery(req.query.limit, 100, 200), offset: numericQuery(req.query.offset, 0, 1_000_000) }));
    }));

    app.use((req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (!(error instanceof AppError)) logger.error(`[ERR] ${req.method} ${req.path}: ${error.stack || error.message}`);
        res.status(error.status || 500).json({
            error: error instanceof AppError ? error.message : 'Internal server error',
            code: error instanceof AppError ? error.code : 'internal_error',
        });
    });

    const io = new Server(httpServer, {
        path: config.socketPath,
        maxHttpBufferSize: config.limits.maxHttpBufferSize,
        cors: corsOptions,
        allowRequest(req, callback) {
            const origin = req.headers.origin;
            callback(null, originAllowed(origin));
        },
    });
    registerSocketHandlers(io, { roomService, youtubeService, config, logger });

    let maintenanceTimer = null;
    let backupTimer = null;
    let started = false;
    const runMaintenance = async () => {
        const expired = roomService.expireInactive();
        for (const roomId of expired) {
            io.to(roomId).emit('room-closed', { roomId, reason: 'inactive' });
            io.in(roomId).socketsLeave(roomId);
            io.in(`${roomId}:player-admin`).socketsLeave(`${roomId}:player-admin`);
        }
        const staleCutoff = Date.now() - config.historyRetentionMs;
        const stale = roomService.staleYouTubeVideoIds(staleCutoff);
        for (const roomId of [...new Set(stale.map((entry) => entry.roomId))]) {
            try {
                const ids = stale.filter((entry) => entry.roomId === roomId).map((entry) => entry.videoId);
                const refreshed = await youtubeService.lookupVideos(ids, roomId);
                if (roomService.refreshYouTubeMetadata(roomId, ids, refreshed)) {
                    io.to(roomId).emit('room-state', roomService.publicState(roomService.requireRoom(roomId)));
                }
            } catch (error) {
                logger.warn(`[WARN] YouTube metadata refresh failed for room ${roomId}: ${error.message}`);
            }
        }
        const purged = roomService.runRetention();
        if (purged.rooms || purged.usage) db.audit(null, 'retention_purge', 'maintenance', null, purged);
        if (expired.length || purged.rooms || purged.usage) logger.info(`[INFO] Maintenance expired=${expired.length} purgedRooms=${purged.rooms} purgedUsage=${purged.usage}`);
    };

    const backupFiles = () => {
        if (!fs.existsSync(config.backupDir)) return [];
        return fs.readdirSync(config.backupDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
            .map((entry) => {
                const filename = path.join(config.backupDir, entry.name);
                return { filename, modifiedAt: fs.statSync(filename).mtimeMs };
            });
    };

    // The newest file in the backup directory is when the last backup completed.
    // Deriving the schedule from it rather than from process uptime means it
    // survives restarts without any extra persisted state, and self-heals if the
    // directory is restored from elsewhere.
    const lastBackupAt = () => backupFiles().reduce((latest, entry) => Math.max(latest, entry.modifiedAt), 0);

    const backupDue = (now = Date.now()) => config.automaticBackups
        && config.databasePath !== ':memory:'
        && now - lastBackupAt() >= config.backupIntervalMs;

    const runBackup = async () => {
        if (!config.automaticBackups || config.databasePath === ':memory:') return null;
        roomService.runRetention();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destination = path.join(config.backupDir, `youtube-karaoke-${stamp}.sqlite`);
        await db.backupTo(destination);
        const cutoff = Date.now() - config.backupRetentionMs;
        for (const entry of backupFiles()) {
            if (entry.filename !== destination && entry.modifiedAt < cutoff) fs.unlinkSync(entry.filename);
        }
        db.audit(null, 'backup_completed', 'maintenance', null, {});
        logger.info(`[INFO] SQLite backup completed: ${destination}`);
        return destination;
    };

    const runBackupIfDue = async () => (backupDue() ? runBackup() : null);

    async function start(port = config.port) {
        if (started) return httpServer.address();
        await runMaintenance();
        await new Promise((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(port, () => { httpServer.off('error', reject); resolve(); });
        });
        started = true;
        maintenanceTimer = setInterval(() => runMaintenance().catch((error) => logger.error(`[ERR] Maintenance failed: ${error.message}`)), config.maintenanceIntervalMs);
        maintenanceTimer.unref();
        if (config.automaticBackups) {
            // A plain backupIntervalMs timer only ever fires on a process that
            // stays up that long, so a host redeployed or restarted more often
            // than the backup period never produced a backup at all. Catch up at
            // startup, then poll often enough that the schedule cannot drift.
            const failed = (error) => logger.error(`[ERR] Backup failed: ${error.stack || error.message}`);
            await runBackupIfDue().catch(failed);
            backupTimer = setInterval(
                () => runBackupIfDue().catch(failed),
                Math.min(config.backupIntervalMs, config.maintenanceIntervalMs)
            );
            backupTimer.unref();
        }
        return httpServer.address();
    }

    async function stop() {
        if (maintenanceTimer) clearInterval(maintenanceTimer);
        if (backupTimer) clearInterval(backupTimer);
        maintenanceTimer = null;
        backupTimer = null;
        if (started) {
            roomService.flush();
            await new Promise((resolve) => io.close(() => httpServer.close(() => resolve())));
            started = false;
        }
        db.close();
    }

    return {
        app, httpServer, io, db, roomService, youtubeService, adminService,
        backupDue, lastBackupAt, runBackup, runBackupIfDue, runMaintenance, start, stop,
    };
}

module.exports = { buildControlUrl, createServer, numericQuery };

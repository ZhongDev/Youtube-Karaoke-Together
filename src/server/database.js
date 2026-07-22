const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { AppError } = require('./security');

const MIGRATIONS = [
    {
        version: 1,
        name: 'v3_initial_schema',
        sql: `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );

            CREATE TABLE rooms (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_activity_at INTEGER NOT NULL,
                closed_at INTEGER,
                close_reason TEXT,
                player_key_hash TEXT NOT NULL,
                settings_json TEXT NOT NULL,
                round_robin_json TEXT NOT NULL,
                current_video_json TEXT,
                playback_json TEXT NOT NULL,
                allow_new_controllers INTEGER NOT NULL DEFAULT 1,
                next_queue_id INTEGER NOT NULL DEFAULT 1,
                version INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX rooms_status_activity_idx ON rooms(status, last_activity_at);
            CREATE INDEX rooms_closed_at_idx ON rooms(closed_at);

            CREATE TABLE room_controllers (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                name TEXT,
                color_hue INTEGER NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                removed_at INTEGER
            );
            CREATE INDEX room_controllers_room_idx ON room_controllers(room_id, removed_at);

            CREATE TABLE room_queue_items (
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                queue_id TEXT NOT NULL,
                youtube_video_id TEXT NOT NULL,
                source_playlist_id TEXT,
                title TEXT NOT NULL,
                channel_title TEXT,
                thumbnail_url TEXT,
                controller_id TEXT REFERENCES room_controllers(id) ON DELETE SET NULL,
                added_by_snapshot TEXT,
                color_hue INTEGER,
                position INTEGER,
                status TEXT NOT NULL CHECK (status IN ('queued', 'playing', 'played', 'skipped', 'removed', 'abandoned')),
                queued_at INTEGER NOT NULL,
                started_at INTEGER,
                ended_at INTEGER,
                removed_at INTEGER,
                api_data_refreshed_at INTEGER NOT NULL,
                PRIMARY KEY (room_id, queue_id)
            );
            CREATE INDEX room_queue_status_idx ON room_queue_items(room_id, status, position);
            CREATE INDEX room_queue_retention_idx ON room_queue_items(api_data_refreshed_at);

            CREATE TABLE room_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                occurred_at INTEGER NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX room_events_room_time_idx ON room_events(room_id, occurred_at);

            CREATE TABLE room_metrics (
                room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
                peak_connected_sockets INTEGER NOT NULL DEFAULT 0,
                peak_public_viewers INTEGER NOT NULL DEFAULT 0,
                peak_controllers INTEGER NOT NULL DEFAULT 0,
                total_registered_controllers INTEGER NOT NULL DEFAULT 0,
                videos_queued INTEGER NOT NULL DEFAULT 0,
                videos_played INTEGER NOT NULL DEFAULT 0,
                videos_skipped INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE registration_invites (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER
            );
            CREATE INDEX registration_invites_room_idx ON registration_invites(room_id, expires_at);

            CREATE TABLE youtube_api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempted_at INTEGER NOT NULL,
                completed_at INTEGER,
                api_key_alias TEXT NOT NULL,
                method TEXT NOT NULL,
                quota_bucket TEXT NOT NULL,
                quota_cost INTEGER NOT NULL,
                quota_catalog_version TEXT NOT NULL,
                room_id TEXT,
                http_status INTEGER,
                error_class TEXT,
                latency_ms INTEGER
            );
            CREATE INDEX youtube_usage_time_idx ON youtube_api_usage(attempted_at);
            CREATE INDEX youtube_usage_method_idx ON youtube_api_usage(method, attempted_at);

            CREATE TABLE admin_users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                display_name TEXT,
                role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_login_at INTEGER
            );
            CREATE UNIQUE INDEX admin_users_email_idx ON admin_users(lower(email));

            CREATE TABLE admin_identities (
                provider TEXT NOT NULL,
                provider_subject TEXT NOT NULL,
                admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
                email_snapshot TEXT,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (provider, provider_subject)
            );

            CREATE TABLE admin_sessions (
                id TEXT PRIMARY KEY,
                admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                csrf_token_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                revoked_at INTEGER
            );
            CREATE INDEX admin_sessions_user_idx ON admin_sessions(admin_user_id, expires_at);

            CREATE TABLE admin_bootstrap_codes (
                id TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                consumed_at INTEGER
            );

            CREATE TABLE admin_invites (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
                code_hash TEXT NOT NULL UNIQUE,
                created_by TEXT NOT NULL REFERENCES admin_users(id),
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                consumed_at INTEGER,
                revoked_at INTEGER
            );
            CREATE INDEX admin_invites_email_idx ON admin_invites(lower(email), expires_at);

            CREATE TABLE admin_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                occurred_at INTEGER NOT NULL,
                detail_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX admin_audit_time_idx ON admin_audit(occurred_at);

            CREATE TABLE policy_acceptances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user_id TEXT REFERENCES admin_users(id) ON DELETE CASCADE,
                anonymous_id_hash TEXT,
                policy_type TEXT NOT NULL,
                policy_version TEXT NOT NULL,
                accepted_at INTEGER NOT NULL
            );
        `,
    },
    {
        version: 2,
        name: 'queue_made_for_kids_status',
        sql: 'ALTER TABLE room_queue_items ADD COLUMN made_for_kids INTEGER NOT NULL DEFAULT 0;',
    },
    {
        version: 3,
        name: 'policy_acceptance_room_scope',
        sql: `ALTER TABLE policy_acceptances ADD COLUMN room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE;
            CREATE INDEX policy_acceptances_room_idx ON policy_acceptances(room_id);`,
    },
    {
        version: 4,
        name: 'youtube_quota_limit_overrides',
        sql: `CREATE TABLE youtube_quota_limits (
            quota_bucket TEXT PRIMARY KEY,
            daily_limit INTEGER NOT NULL CHECK (daily_limit > 0),
            updated_at INTEGER NOT NULL,
            updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL
        );`,
    },
];

function json(value, fallback = null) {
    if (value === undefined) return fallback === null ? null : JSON.stringify(fallback);
    return value === null ? null : JSON.stringify(value);
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function queueRowToVideo(row) {
    return {
        queueId: row.queue_id,
        id: row.youtube_video_id,
        sourcePlaylistId: row.source_playlist_id || undefined,
        title: row.title,
        channelTitle: row.channel_title || '',
        thumbnailUrl: row.thumbnail_url || undefined,
        controllerId: row.controller_id || undefined,
        addedBy: row.added_by_snapshot || undefined,
        colorHue: row.color_hue ?? undefined,
        madeForKids: Boolean(row.made_for_kids),
        queuedAt: row.queued_at,
        apiDataRefreshedAt: row.api_data_refreshed_at,
    };
}

class AppDatabase {
    constructor(filename, { logger = console } = {}) {
        this.filename = filename;
        this.logger = logger;
        if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
        this.db = new Database(filename);
        if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');
        if (filename !== ':memory:') this.db.pragma('journal_mode = WAL');
        this.migrate();
    }

    migrate() {
        this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        )`);
        const applied = new Set(this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
        for (const migration of MIGRATIONS) {
            if (applied.has(migration.version)) continue;
            this.db.transaction(() => {
                this.db.exec(migration.sql);
                this.db.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
                    .run(migration.version, migration.name, Date.now());
            })();
            this.logger.info(`[INFO] Applied database migration ${migration.version}: ${migration.name}`);
        }
    }

    health() {
        return this.db.prepare('PRAGMA quick_check').pluck().get() === 'ok';
    }

    close() {
        if (!this.db.open) return;
        if (this.filename !== ':memory:') this.db.pragma('wal_checkpoint(TRUNCATE)');
        this.db.close();
    }

    async backupTo(destination) {
        if (this.filename === ':memory:') throw new Error('Cannot back up an in-memory database');
        fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        await this.db.backup(destination);
        fs.chmodSync(destination, 0o600);
        return destination;
    }

    saveRoom(room) {
        const now = Date.now();
        this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO rooms (
                    id, status, created_at, updated_at, last_activity_at, closed_at, close_reason,
                    player_key_hash, settings_json, round_robin_json, current_video_json, playback_json,
                    allow_new_controllers, next_queue_id, version
                ) VALUES (
                    @id, @status, @createdAt, @updatedAt, @lastActivityAt, @closedAt, @closeReason,
                    @playerKeyHash, @settingsJson, @roundRobinJson, @currentVideoJson, @playbackJson,
                    @allowNewControllers, @nextQueueId, @version
                ) ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status, updated_at=excluded.updated_at, last_activity_at=excluded.last_activity_at,
                    closed_at=excluded.closed_at, close_reason=excluded.close_reason,
                    settings_json=excluded.settings_json, round_robin_json=excluded.round_robin_json,
                    current_video_json=excluded.current_video_json, playback_json=excluded.playback_json,
                    allow_new_controllers=excluded.allow_new_controllers,
                    next_queue_id=excluded.next_queue_id, version=excluded.version
            `).run({
                id: room.id,
                status: room.status,
                createdAt: room.createdAt,
                updatedAt: now,
                lastActivityAt: room.lastActivityAt,
                closedAt: room.closedAt || null,
                closeReason: room.closeReason || null,
                playerKeyHash: room.playerKeyHash,
                settingsJson: json(room.settings, {}),
                roundRobinJson: json(room.roundRobin, { participants: [], lastServedControllerId: null }),
                currentVideoJson: json(room.currentVideo),
                playbackJson: json(room.playback, {}),
                allowNewControllers: room.allowNewControllers ? 1 : 0,
                nextQueueId: room.nextQueueId,
                version: room.version,
            });

            this.db.prepare(`
                INSERT INTO room_metrics(room_id, updated_at) VALUES (?, ?)
                ON CONFLICT(room_id) DO NOTHING
            `).run(room.id, now);

            const upsertController = this.db.prepare(`
                INSERT INTO room_controllers(id, room_id, token_hash, name, color_hue, enabled, created_at, updated_at, removed_at)
                VALUES (@id, @roomId, @tokenHash, @name, @colorHue, @enabled, @createdAt, @updatedAt, @removedAt)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, color_hue=excluded.color_hue,
                    enabled=excluded.enabled, updated_at=excluded.updated_at, removed_at=excluded.removed_at
            `);
            for (const controller of room.controllers.values()) {
                upsertController.run({
                    id: controller.id,
                    roomId: room.id,
                    tokenHash: controller.tokenHash,
                    name: controller.name,
                    colorHue: controller.colorHue,
                    enabled: controller.enabled ? 1 : 0,
                    createdAt: controller.createdAt,
                    updatedAt: now,
                    removedAt: controller.removedAt || null,
                });
            }

            const upsertItem = this.db.prepare(`
                INSERT INTO room_queue_items(
                    room_id, queue_id, youtube_video_id, source_playlist_id, title, channel_title,
                    thumbnail_url, controller_id, added_by_snapshot, color_hue, position, status,
                    queued_at, started_at, api_data_refreshed_at, made_for_kids
                ) VALUES (
                    @roomId, @queueId, @videoId, @sourcePlaylistId, @title, @channelTitle,
                    @thumbnailUrl, @controllerId, @addedBy, @colorHue, @position, @status,
                    @queuedAt, @startedAt, @refreshedAt, @madeForKids
                ) ON CONFLICT(room_id, queue_id) DO UPDATE SET
                    title=excluded.title, channel_title=excluded.channel_title, thumbnail_url=excluded.thumbnail_url,
                    controller_id=excluded.controller_id, added_by_snapshot=excluded.added_by_snapshot,
                    color_hue=excluded.color_hue, position=excluded.position, status=excluded.status,
                    started_at=COALESCE(room_queue_items.started_at, excluded.started_at),
                    api_data_refreshed_at=excluded.api_data_refreshed_at, made_for_kids=excluded.made_for_kids
            `);
            room.queue.forEach((item, position) => upsertItem.run(this.queueParams(room.id, item, position, 'queued')));
            if (room.currentVideo) upsertItem.run(this.queueParams(room.id, room.currentVideo, null, 'playing'));
        })();
    }

    queueParams(roomId, item, position, status) {
        return {
            roomId,
            queueId: String(item.queueId),
            videoId: item.id,
            sourcePlaylistId: item.sourcePlaylistId || null,
            title: item.title,
            channelTitle: item.channelTitle || null,
            thumbnailUrl: item.thumbnailUrl || null,
            controllerId: item.controllerId || null,
            addedBy: item.addedBy || null,
            colorHue: item.colorHue ?? null,
            position,
            status,
            queuedAt: item.queuedAt || Date.now(),
            startedAt: status === 'playing' ? (item.startedAt || Date.now()) : null,
            refreshedAt: item.apiDataRefreshedAt || item.queuedAt || Date.now(),
            madeForKids: item.madeForKids ? 1 : 0,
        };
    }

    loadActiveRooms() {
        const roomRows = this.db.prepare("SELECT * FROM rooms WHERE status = 'active'").all();
        const controllerQuery = this.db.prepare('SELECT * FROM room_controllers WHERE room_id = ?');
        const queueQuery = this.db.prepare("SELECT * FROM room_queue_items WHERE room_id = ? AND status = 'queued' ORDER BY position, queued_at");
        return roomRows.map((row) => {
            const controllers = new Map();
            for (const controller of controllerQuery.all(row.id)) {
                controllers.set(controller.token_hash, {
                    id: controller.id,
                    tokenHash: controller.token_hash,
                    name: controller.name,
                    colorHue: controller.color_hue,
                    enabled: Boolean(controller.enabled),
                    createdAt: controller.created_at,
                    removedAt: controller.removed_at,
                });
            }
            return {
                id: row.id,
                status: row.status,
                createdAt: row.created_at,
                lastActivityAt: row.last_activity_at,
                closedAt: row.closed_at,
                closeReason: row.close_reason,
                playerKeyHash: row.player_key_hash,
                settings: parseJson(row.settings_json, { roundRobinEnabled: false }),
                roundRobin: parseJson(row.round_robin_json, { participants: [], lastServedControllerId: null }),
                currentVideo: parseJson(row.current_video_json, null),
                playback: parseJson(row.playback_json, {}),
                allowNewControllers: Boolean(row.allow_new_controllers),
                nextQueueId: row.next_queue_id,
                version: row.version,
                controllers,
                queue: queueQuery.all(row.id).map(queueRowToVideo),
            };
        });
    }

    recordRoomEvent(roomId, eventType, payload = {}, occurredAt = Date.now()) {
        this.db.prepare('INSERT INTO room_events(room_id, event_type, occurred_at, payload_json) VALUES (?, ?, ?, ?)')
            .run(roomId, eventType, occurredAt, json(payload, {}));
    }

    setQueueItemStatus(roomId, queueId, status, at = Date.now()) {
        const timeField = status === 'removed' ? 'removed_at' : (status === 'playing' ? 'started_at' : 'ended_at');
        const sql = `UPDATE room_queue_items SET status = ?, position = NULL, ${timeField} = COALESCE(${timeField}, ?) WHERE room_id = ? AND queue_id = ?`;
        this.db.prepare(sql).run(status, at, roomId, String(queueId));
    }

    updateRoomMetrics(roomId, patch) {
        const current = this.db.prepare('SELECT * FROM room_metrics WHERE room_id = ?').get(roomId) || {};
        const fields = {
            peak_connected_sockets: Math.max(current.peak_connected_sockets || 0, patch.peakConnectedSockets || 0),
            peak_public_viewers: Math.max(current.peak_public_viewers || 0, patch.peakPublicViewers || 0),
            peak_controllers: Math.max(current.peak_controllers || 0, patch.peakControllers || 0),
            total_registered_controllers: (current.total_registered_controllers || 0) + (patch.registeredDelta || 0),
            videos_queued: (current.videos_queued || 0) + (patch.queuedDelta || 0),
            videos_played: (current.videos_played || 0) + (patch.playedDelta || 0),
            videos_skipped: (current.videos_skipped || 0) + (patch.skippedDelta || 0),
        };
        this.db.prepare(`
            INSERT INTO room_metrics(
                room_id, peak_connected_sockets, peak_public_viewers, peak_controllers,
                total_registered_controllers, videos_queued, videos_played, videos_skipped, updated_at
            ) VALUES (@roomId, @peak_connected_sockets, @peak_public_viewers, @peak_controllers,
                @total_registered_controllers, @videos_queued, @videos_played, @videos_skipped, @updatedAt)
            ON CONFLICT(room_id) DO UPDATE SET
                peak_connected_sockets=excluded.peak_connected_sockets,
                peak_public_viewers=excluded.peak_public_viewers,
                peak_controllers=excluded.peak_controllers,
                total_registered_controllers=excluded.total_registered_controllers,
                videos_queued=excluded.videos_queued, videos_played=excluded.videos_played,
                videos_skipped=excluded.videos_skipped, updated_at=excluded.updated_at
        `).run({ roomId, ...fields, updatedAt: Date.now() });
    }

    createRegistrationInvite({ id, roomId, tokenHash, createdAt, expiresAt }) {
        this.db.prepare('INSERT INTO registration_invites(id, room_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
            .run(id, roomId, tokenHash, createdAt, expiresAt);
    }

    registrationInvite(tokenHash, now = Date.now()) {
        return this.db.prepare(`SELECT * FROM registration_invites
            WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`).get(tokenHash, now);
    }

    closeRoom(roomId, reason, closedAt = Date.now()) {
        this.db.transaction(() => {
            this.db.prepare(`UPDATE rooms SET status='closed', closed_at=?, updated_at=?, close_reason=?,
                current_video_json=NULL, round_robin_json='{"participants":[],"lastServedControllerId":null}',
                playback_json='{"state":"unstarted","positionSec":0,"durationSec":null,"videoId":null}' WHERE id=?`)
                .run(closedAt, closedAt, reason, roomId);
            this.db.prepare("UPDATE room_queue_items SET status='abandoned', position=NULL, ended_at=COALESCE(ended_at, ?) WHERE room_id=? AND status IN ('queued','playing')")
                .run(closedAt, roomId);
            this.db.prepare('UPDATE room_queue_items SET added_by_snapshot=NULL, controller_id=NULL WHERE room_id=?').run(roomId);
            this.db.prepare('DELETE FROM room_controllers WHERE room_id=?').run(roomId);
            this.db.prepare('UPDATE registration_invites SET revoked_at=? WHERE room_id=? AND revoked_at IS NULL').run(closedAt, roomId);
            this.db.prepare('DELETE FROM room_events WHERE room_id=?').run(roomId);
            this.recordRoomEvent(roomId, 'room_closed', { reason }, closedAt);
        })();
    }

    deleteRoomData(roomId, anonymousIdHash) {
        return this.db.transaction(() => {
            this.db.prepare('DELETE FROM youtube_api_usage WHERE room_id=?').run(roomId);
            if (anonymousIdHash) this.db.prepare('DELETE FROM policy_acceptances WHERE anonymous_id_hash=?').run(anonymousIdHash);
            return this.db.prepare('DELETE FROM rooms WHERE id=?').run(roomId).changes === 1;
        })();
    }

    purgeExpired(cutoff) {
        return this.db.transaction(() => {
            const rooms = this.db.prepare("DELETE FROM rooms WHERE status='closed' AND closed_at <= ?").run(cutoff).changes;
            const usage = this.db.prepare('DELETE FROM youtube_api_usage WHERE attempted_at <= ?').run(cutoff).changes;
            this.db.prepare('DELETE FROM policy_acceptances WHERE admin_user_id IS NULL AND accepted_at <= ?').run(cutoff);
            this.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(Date.now());
            this.db.prepare('DELETE FROM registration_invites WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(Date.now());
            this.db.prepare('DELETE FROM admin_bootstrap_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL').run(Date.now());
            this.db.prepare('DELETE FROM admin_invites WHERE expires_at <= ? OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL').run(Date.now());
            return { rooms, usage };
        })();
    }

    listRooms({ status = 'active', limit = 50, offset = 0, from = null, to = null } = {}) {
        const clauses = ['r.status = ?'];
        const params = [status];
        if (from) { clauses.push('COALESCE(r.closed_at, r.created_at) >= ?'); params.push(from); }
        if (to) { clauses.push('COALESCE(r.closed_at, r.created_at) <= ?'); params.push(to); }
        const total = this.db.prepare(`SELECT COUNT(*) count FROM rooms r WHERE ${clauses.join(' AND ')}`).get(...params).count;
        const rows = this.db.prepare(`
            SELECT r.*, m.peak_connected_sockets, m.peak_public_viewers, m.peak_controllers,
                m.total_registered_controllers, m.videos_queued, m.videos_played, m.videos_skipped,
                (SELECT COUNT(*) FROM room_queue_items q WHERE q.room_id=r.id AND q.status='queued') queue_length
            FROM rooms r LEFT JOIN room_metrics m ON m.room_id=r.id
            WHERE ${clauses.join(' AND ')}
            ORDER BY COALESCE(r.closed_at, r.last_activity_at) DESC LIMIT ? OFFSET ?
        `).all(...params, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0));
        return { total, rows: rows.map((row) => this.adminRoomSummary(row)) };
    }

    adminRoomSummary(row) {
        const current = parseJson(row.current_video_json, null);
        return {
            id: row.id,
            status: row.status,
            createdAt: row.created_at,
            lastActivityAt: row.last_activity_at,
            closedAt: row.closed_at,
            closeReason: row.close_reason,
            currentVideo: current ? { id: current.id, title: current.title, channelTitle: current.channelTitle } : null,
            queueLength: row.queue_length || 0,
            peakConnectedSockets: row.peak_connected_sockets || 0,
            peakPublicViewers: row.peak_public_viewers || 0,
            peakControllers: row.peak_controllers || 0,
            totalRegisteredControllers: row.total_registered_controllers || 0,
            videosQueued: row.videos_queued || 0,
            videosPlayed: row.videos_played || 0,
            videosSkipped: row.videos_skipped || 0,
        };
    }

    roomDetail(roomId) {
        const row = this.db.prepare(`SELECT r.*, m.*, (SELECT COUNT(*) FROM room_queue_items q WHERE q.room_id=r.id AND q.status='queued') queue_length
            FROM rooms r LEFT JOIN room_metrics m ON m.room_id=r.id WHERE r.id=?`).get(roomId);
        if (!row) return null;
        const videos = this.db.prepare(`SELECT queue_id, youtube_video_id, source_playlist_id, title, channel_title,
            status, queued_at, started_at, ended_at, removed_at FROM room_queue_items WHERE room_id=? ORDER BY queued_at`).all(roomId);
        const events = this.db.prepare('SELECT event_type, occurred_at, payload_json FROM room_events WHERE room_id=? ORDER BY occurred_at DESC LIMIT 200').all(roomId)
            .map((event) => ({ type: event.event_type, occurredAt: event.occurred_at, detail: parseJson(event.payload_json, {}) }));
        return { ...this.adminRoomSummary(row), videos: videos.map((video) => ({
            queueId: video.queue_id,
            videoId: video.youtube_video_id,
            sourcePlaylistId: video.source_playlist_id,
            title: video.title,
            channelTitle: video.channel_title,
            status: video.status,
            queuedAt: video.queued_at,
            startedAt: video.started_at,
            endedAt: video.ended_at,
            removedAt: video.removed_at,
        })), events };
    }

    beginYoutubeUsage(entry) {
        return this.db.prepare(`INSERT INTO youtube_api_usage(
            attempted_at, api_key_alias, method, quota_bucket, quota_cost, quota_catalog_version, room_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            entry.attemptedAt, entry.apiKeyAlias, entry.method, entry.quotaBucket,
            entry.quotaCost, entry.catalogVersion, entry.roomId || null
        ).lastInsertRowid;
    }

    finishYoutubeUsage(id, entry) {
        this.db.prepare(`UPDATE youtube_api_usage SET completed_at=?, http_status=?, error_class=?, latency_ms=? WHERE id=?`)
            .run(entry.completedAt, entry.httpStatus || null, entry.errorClass || null, entry.latencyMs, id);
    }

    youtubeUsageSince(since) {
        return this.db.prepare('SELECT * FROM youtube_api_usage WHERE attempted_at >= ? ORDER BY attempted_at DESC').all(since);
    }

    youtubeQuotaLimits() {
        return Object.fromEntries(this.db.prepare('SELECT quota_bucket,daily_limit FROM youtube_quota_limits').all()
            .map((row) => [row.quota_bucket, row.daily_limit]));
    }

    updateYoutubeQuotaLimits(updates, actorId, now = Date.now()) {
        this.db.transaction(() => {
            const upsert = this.db.prepare(`INSERT INTO youtube_quota_limits(quota_bucket,daily_limit,updated_at,updated_by)
                VALUES (?,?,?,?) ON CONFLICT(quota_bucket) DO UPDATE SET
                daily_limit=excluded.daily_limit,updated_at=excluded.updated_at,updated_by=excluded.updated_by`);
            const remove = this.db.prepare('DELETE FROM youtube_quota_limits WHERE quota_bucket=?');
            for (const [bucket, limit] of Object.entries(updates)) {
                if (limit === null) remove.run(bucket);
                else upsert.run(bucket, limit, now, actorId);
            }
            this.audit(actorId, 'youtube_quota_limits_updated', 'youtube_quota', null, { updates }, now);
        })();
        return this.youtubeQuotaLimits();
    }

    recordPolicyAcceptance({ adminUserId = null, anonymousIdHash = null, roomId = null, policyType, policyVersion, acceptedAt = Date.now() }) {
        this.db.prepare(`INSERT INTO policy_acceptances(
            admin_user_id, anonymous_id_hash, room_id, policy_type, policy_version, accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?)`).run(adminUserId, anonymousIdHash, roomId, policyType, policyVersion, acceptedAt);
    }

    ownerCount() {
        return this.db.prepare("SELECT COUNT(*) count FROM admin_users WHERE role='owner' AND enabled=1").get().count;
    }

    createBootstrapCode({ id, codeHash, createdAt, expiresAt }) {
        if (this.ownerCount() > 0) throw new Error('An owner already exists');
        this.db.prepare('UPDATE admin_bootstrap_codes SET consumed_at=? WHERE consumed_at IS NULL').run(createdAt);
        this.db.prepare('INSERT INTO admin_bootstrap_codes(id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
            .run(id, codeHash, createdAt, expiresAt);
    }

    consumeBootstrapCode(codeHash, now = Date.now()) {
        const row = this.db.prepare('SELECT * FROM admin_bootstrap_codes WHERE code_hash=? AND consumed_at IS NULL AND expires_at>?').get(codeHash, now);
        if (!row) return false;
        return this.db.prepare('UPDATE admin_bootstrap_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(now, row.id).changes === 1;
    }

    adminIdentity(provider, subject) {
        return this.db.prepare(`SELECT u.*, i.provider, i.provider_subject FROM admin_identities i
            JOIN admin_users u ON u.id=i.admin_user_id WHERE i.provider=? AND i.provider_subject=?`).get(provider, subject);
    }

    createAdminWithIdentity({ id, email, displayName, role, provider, subject, now = Date.now() }) {
        this.db.transaction(() => {
            this.db.prepare(`INSERT INTO admin_users(id,email,display_name,role,created_at,updated_at,last_login_at)
                VALUES (?,?,?,?,?,?,?)`).run(id, email, displayName || null, role, now, now, now);
            this.db.prepare(`INSERT INTO admin_identities(provider,provider_subject,admin_user_id,email_snapshot,created_at)
                VALUES (?,?,?,?,?)`).run(provider, subject, id, email, now);
        })();
        return this.db.prepare('SELECT * FROM admin_users WHERE id=?').get(id);
    }

    touchAdminLogin(id, now = Date.now()) {
        this.db.prepare('UPDATE admin_users SET last_login_at=?, updated_at=? WHERE id=?').run(now, now, id);
    }

    createAdminSession({ id, userId, tokenHash, csrfTokenHash, createdAt, expiresAt }) {
        this.db.prepare(`INSERT INTO admin_sessions(id,admin_user_id,token_hash,csrf_token_hash,created_at,expires_at,last_used_at)
            VALUES (?,?,?,?,?,?,?)`).run(id, userId, tokenHash, csrfTokenHash, createdAt, expiresAt, createdAt);
    }

    adminSession(tokenHash, now = Date.now()) {
        const row = this.db.prepare(`SELECT s.*, u.email, u.display_name, u.role, u.enabled
            FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id
            WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.enabled=1`).get(tokenHash, now);
        if (row) this.db.prepare('UPDATE admin_sessions SET last_used_at=? WHERE id=?').run(now, row.id);
        return row;
    }

    revokeAdminSession(tokenHash, now = Date.now()) {
        return this.db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now, tokenHash).changes;
    }

    revokeAllAdminSessions(userId, now = Date.now()) {
        return this.db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE admin_user_id=? AND revoked_at IS NULL').run(now, userId).changes;
    }

    listAdminSessions(userId, now = Date.now()) {
        return this.db.prepare(`SELECT id,created_at,expires_at,last_used_at FROM admin_sessions
            WHERE admin_user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_used_at DESC`).all(userId, now);
    }

    listAdmins() {
        return this.db.prepare(`SELECT id,email,display_name,role,enabled,created_at,updated_at,last_login_at
            FROM admin_users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, email`).all();
    }

    updateAdmin(userId, { role, enabled }, actorId, now = Date.now()) {
        const user = this.db.prepare('SELECT * FROM admin_users WHERE id=?').get(userId);
        if (!user) return null;
        const nextRole = role || user.role;
        const nextEnabled = enabled === undefined ? user.enabled : (enabled ? 1 : 0);
        if (user.role === 'owner' && (nextRole !== 'owner' || !nextEnabled)) {
            const owners = this.ownerCount();
            if (owners <= 1) throw new AppError('last_owner', 'Cannot remove or disable the last owner', 409);
        }
        this.db.prepare('UPDATE admin_users SET role=?,enabled=?,updated_at=? WHERE id=?').run(nextRole, nextEnabled, now, userId);
        if (!nextEnabled) this.revokeAllAdminSessions(userId, now);
        this.audit(actorId, 'admin_updated', 'admin_user', userId, { role: nextRole, enabled: Boolean(nextEnabled) }, now);
        return this.db.prepare('SELECT * FROM admin_users WHERE id=?').get(userId);
    }

    recoverOwnerByEmail(email, now = Date.now()) {
        const user = this.db.prepare('SELECT * FROM admin_users WHERE lower(email)=lower(?)').get(email);
        if (!user) return null;
        this.db.transaction(() => {
            this.db.prepare("UPDATE admin_users SET role='owner',enabled=1,updated_at=? WHERE id=?").run(now, user.id);
            this.revokeAllAdminSessions(user.id, now);
            this.audit(null, 'owner_recovered_by_operator', 'admin_user', user.id, {}, now);
        })();
        return this.db.prepare('SELECT * FROM admin_users WHERE id=?').get(user.id);
    }

    createAdminInvite({ id, email, role, codeHash, createdBy, createdAt, expiresAt }) {
        this.db.prepare(`INSERT INTO admin_invites(id,email,role,code_hash,created_by,created_at,expires_at)
            VALUES (?,?,?,?,?,?,?)`).run(id, email, role, codeHash, createdBy, createdAt, expiresAt);
    }

    consumeAdminInvite(codeHash, email, now = Date.now()) {
        const row = this.db.prepare(`SELECT * FROM admin_invites WHERE code_hash=? AND lower(email)=lower(?)
            AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?`).get(codeHash, email, now);
        if (!row) return null;
        if (this.db.prepare('UPDATE admin_invites SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(now, row.id).changes !== 1) return null;
        return row;
    }

    audit(userId, action, targetType = null, targetId = null, detail = {}, now = Date.now()) {
        this.db.prepare(`INSERT INTO admin_audit(admin_user_id,action,target_type,target_id,occurred_at,detail_json)
            VALUES (?,?,?,?,?,?)`).run(userId || null, action, targetType, targetId, now, json(detail, {}));
    }

    listAudit({ limit = 100, offset = 0 } = {}) {
        const total = this.db.prepare('SELECT COUNT(*) count FROM admin_audit').get().count;
        const rows = this.db.prepare(`SELECT a.*,u.email FROM admin_audit a LEFT JOIN admin_users u ON u.id=a.admin_user_id
            ORDER BY occurred_at DESC LIMIT ? OFFSET ?`).all(Math.min(Math.max(limit, 1), 200), Math.max(offset, 0));
        return { total, rows: rows.map((row) => ({
            id: row.id,
            actorEmail: row.email,
            action: row.action,
            targetType: row.target_type,
            targetId: row.target_id,
            occurredAt: row.occurred_at,
            detail: parseJson(row.detail_json, {}),
        })) };
    }
}

module.exports = { AppDatabase, MIGRATIONS, parseJson, queueRowToVideo };

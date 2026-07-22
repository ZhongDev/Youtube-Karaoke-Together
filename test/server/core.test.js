const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { io: createClient } = require('socket.io-client');
const { AdminService } = require('../../src/server/adminService');
const { loadConfig } = require('../../src/server/config');
const { buildControlUrl, createServer } = require('../../src/server/createServer');
const { AppDatabase } = require('../../src/server/database');
const { RoomService } = require('../../src/server/roomService');

const runtimes = [];

function quietLogger() {
    return { info() {}, warn() {}, error() {} };
}

async function runtime(overrides = {}) {
    const config = loadConfig({
        nodeEnv: 'test',
        databasePath: ':memory:',
        port: 0,
        youtubeApiKey: 'test-key',
        maintenanceIntervalMs: 3_600_000,
        ...overrides,
    }, quietLogger());
    const instance = createServer({
        config,
        logger: quietLogger(),
        fetchImpl: async () => new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }),
    });
    await instance.start(0);
    runtimes.push(instance);
    return instance;
}

afterEach(async () => {
    while (runtimes.length) await runtimes.pop().stop();
});

test('QR registration capabilities use a URL fragment that is not sent to HTTP/proxy logs', () => {
    const url = buildControlUrl({ publicFrontendOrigin: 'https://karaoke.example.com' }, 'room-id', 'secret token');
    assert.equal(url, 'https://karaoke.example.com/control/room-id#token=secret%20token');
    assert.equal(new URL(url).search, '');
});

test('CORS compares normalized origins exactly', async () => {
    const instance = await runtime({ publicFrontendOrigin: 'https://karaoke.example.com' });
    const url = `http://127.0.0.1:${instance.httpServer.address().port}/api/health`;
    const allowed = await fetch(url, { headers: { Origin: 'https://karaoke.example.com' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://karaoke.example.com');

    const lookalike = await fetch(url, { headers: { Origin: 'https://karaoke.example.com.evil.test' } });
    assert.equal(lookalike.status, 403);
    assert.equal(lookalike.headers.get('access-control-allow-origin'), null);
});

test('room creation requires and records the current privacy policy version without raw identity data', async () => {
    const instance = await runtime({ tokenPepper: 'policy-pepper' });
    const base = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const missing = await fetch(`${base}/api/rooms`, { method: 'POST' });
    assert.equal(missing.status, 428);
    assert.equal((await missing.json()).code, 'policy_acceptance_required');

    const created = await fetch(`${base}/api/rooms`, {
        method: 'POST',
        headers: { 'x-privacy-policy-version': instance.roomService.config.currentPrivacyPolicyVersion },
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.deepEqual(Object.keys(body).sort(), ['playerKey', 'roomId']);
    const acceptance = instance.db.db.prepare('SELECT * FROM policy_acceptances').get();
    assert.equal(acceptance.policy_version, instance.roomService.config.currentPrivacyPolicyVersion);
    assert.notEqual(acceptance.anonymous_id_hash, body.roomId);
    assert.equal(acceptance.anonymous_id_hash.length, 64);
});

test('controller registration requires the current privacy version and returns correlated acknowledgement data', async () => {
    const instance = await runtime({ tokenPepper: 'controller-policy-pepper' });
    const created = instance.roomService.createRoom();
    const port = instance.httpServer.address().port;
    const socket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    const emitRegistration = (policyVersion) => new Promise((resolve, reject) => {
        socket.timeout(1000).emit('register-controller', {
            roomId: created.room.id,
            controlMasterKey: created.registrationToken,
            username: 'Policy Singer',
            policyVersion,
        }, (error, response) => error ? reject(error) : resolve(response));
    });
    const outdated = await emitRegistration('old-version');
    assert.equal(outdated.ok, false);
    assert.equal(outdated.error.code, 'policy_acceptance_required');
    const accepted = await emitRegistration(instance.roomService.config.currentPrivacyPolicyVersion);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.username, 'Policy Singer');
    assert.ok(accepted.controllerKey);
    assert.equal(instance.db.db.prepare('SELECT COUNT(*) count FROM policy_acceptances').get().count, 1);
    socket.close();
});

test('a room creator can permanently delete active room data with explicit confirmation', async () => {
    const instance = await runtime({ tokenPepper: 'deletion-pepper' });
    const base = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const createdResponse = await fetch(`${base}/api/rooms`, {
        method: 'POST', headers: { 'x-privacy-policy-version': instance.roomService.config.currentPrivacyPolicyVersion },
    });
    const created = await createdResponse.json();
    instance.db.beginYoutubeUsage({
        attemptedAt: Date.now(), apiKeyAlias: 'test', method: 'videos.list', quotaBucket: 'general_units',
        quotaCost: 1, catalogVersion: 'test', roomId: created.roomId,
    });
    const rejected = await fetch(`${base}/api/rooms/${created.roomId}/data`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${created.playerKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'wrong' }),
    });
    assert.equal(rejected.status, 400);
    const deleted = await fetch(`${base}/api/rooms/${created.roomId}/data`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${created.playerKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: created.roomId }),
    });
    assert.equal(deleted.status, 204);
    assert.equal(instance.roomService.get(created.roomId), null);
    assert.equal(instance.db.db.prepare('SELECT COUNT(*) count FROM rooms').get().count, 0);
    assert.equal(instance.db.db.prepare('SELECT COUNT(*) count FROM youtube_api_usage').get().count, 0);
    assert.equal(instance.db.db.prepare('SELECT COUNT(*) count FROM policy_acceptances').get().count, 0);
});

test('malformed socket payloads return structured errors without terminating the server', async () => {
    const instance = await runtime();
    const port = instance.httpServer.address().port;
    const socket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    const guardedEvents = [
        'join-room-admin', 'register-controller', 'auth-controller', 'rename-controller',
        'update-controller-color', 'add-to-queue', 'play-next', 'player-play-next',
        'request-room-state', 'remove-from-queue', 'update-settings', 'playback-state',
        'admin-toggle-controller', 'admin-remove-controller', 'admin-toggle-registration',
    ];
    const noPayload = await new Promise((resolve) => {
        socket.once('error-message', resolve);
        socket.emit('join-room-admin');
    });
    assert.equal(noPayload.type, 'join-room-admin');
    for (const event of guardedEvents) {
        const response = await new Promise((resolve, reject) => {
            socket.timeout(1000).emit(event, null, (timeoutError, acknowledgement) => {
                if (timeoutError) reject(timeoutError);
                else resolve(acknowledgement);
            });
        });
        assert.equal(response.ok, false, `${event} should reject malformed input`);
        assert.equal(response.error.type, event);
    }
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    socket.close();
});

test('queue mutations use stable IDs and duplicate advances are idempotent', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'test-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const registration = service.registerController(created.room.id, created.registrationToken, 'Singer');
    const initialAdd = service.addVideos(created.room.id, registration.controllerKey, [
        { id: 'abcdefghijk', title: 'One' },
        { id: 'lmnopqrstuv', title: 'Two' },
        { id: 'wxyzABCDEFG', title: 'Three' },
    ]);
    const queuedBehindCurrent = service.addVideos(created.room.id, registration.controllerKey, [
        { id: 'hijklmnopqr', title: 'Four' },
    ]);
    assert.equal(initialAdd.currentChanged, true);
    assert.equal(queuedBehindCurrent.currentChanged, false);
    const expected = created.room.currentVideo.queueId;
    assert.equal(created.room.playback.queueId, expected);
    const first = service.advance(created.room.id, registration.controllerKey, expected, 'controller');
    const afterFirst = created.room.currentVideo.queueId;
    const duplicate = service.advance(created.room.id, registration.controllerKey, expected, 'controller');
    assert.equal(first.advanced, true);
    assert.deepEqual(duplicate, { advanced: false, reason: 'stale', currentQueueId: afterFirst });
    assert.equal(created.room.currentVideo.queueId, afterFirst);
    assert.equal(created.room.playback.queueId, afterFirst);
    assert.throws(() => service.updatePlayback(created.room.id, created.playerKey, {
        queueId: expected, videoId: created.room.currentVideo.id, state: 'playing', positionSec: 10,
    }), /stale queue item/);

    const removeId = created.room.queue[0].queueId;
    service.removeFromQueue(created.room.id, registration.controllerKey, removeId);
    assert.equal(created.room.queue.some((item) => item.queueId === removeId), false);
    db.close();
});

test('round-robin ordering tracks the last served stable controller ID', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'round-robin-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const idle = service.registerController(created.room.id, created.registrationToken, 'Idle');
    const singerB = service.registerController(created.room.id, created.registrationToken, 'Singer B');
    const singerC = service.registerController(created.room.id, created.registrationToken, 'Singer C');
    service.updateSettings(created.room.id, idle.controllerKey, { roundRobinEnabled: true });
    service.addVideos(created.room.id, singerB.controllerKey, [
        { id: 'bbbbbbbbbb1', title: 'B1' }, { id: 'bbbbbbbbbb2', title: 'B2' },
    ]);
    service.addVideos(created.room.id, singerC.controllerKey, [
        { id: 'cccccccccc1', title: 'C1' }, { id: 'cccccccccc2', title: 'C2' },
    ]);
    assert.equal(created.room.currentVideo.title, 'B1');
    assert.deepEqual(created.room.queue.map((video) => video.title), ['C1', 'B2', 'C2']);
    assert.equal(created.room.roundRobin.lastServedControllerId, singerB.controller.id);
    db.close();
});

test('active room state and hashed credentials survive a database restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ytkt-v3-test-'));
    const filename = path.join(directory, 'rooms.sqlite');
    const config = loadConfig({ nodeEnv: 'test', databasePath: filename, tokenPepper: 'persistent-pepper' }, quietLogger());
    let db = new AppDatabase(filename, { logger: quietLogger() });
    let service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const registration = service.registerController(created.room.id, created.registrationToken, 'Persistent Singer');
    service.addVideos(created.room.id, registration.controllerKey, [
        { id: 'abcdefghijk', title: 'Persisted current' },
        { id: 'lmnopqrstuv', title: 'Persisted queue' },
    ]);
    db.close();

    db = new AppDatabase(filename, { logger: quietLogger() });
    service = new RoomService({ db, config, logger: quietLogger() });
    const restored = service.requireRoom(created.room.id);
    assert.equal(restored.currentVideo.title, 'Persisted current');
    assert.equal(restored.queue[0].title, 'Persisted queue');
    assert.equal(service.controller(restored, registration.controllerKey).name, 'Persistent Singer');
    assert.equal(service.validatePlayer(restored, created.playerKey), true);
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('graceful shutdown flushes the latest playback checkpoint', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ytkt-v3-flush-'));
    const filename = path.join(directory, 'rooms.sqlite');
    const config = loadConfig({
        nodeEnv: 'test', databasePath: filename, port: 0, tokenPepper: 'flush-pepper',
        playbackCheckpointMs: Number.MAX_SAFE_INTEGER,
    }, quietLogger());
    const instance = createServer({ config, logger: quietLogger() });
    await instance.start(0);
    const created = instance.roomService.createRoom();
    const registration = instance.roomService.registerController(created.room.id, created.registrationToken, 'Flush Singer');
    instance.roomService.addVideos(created.room.id, registration.controllerKey, [{ id: 'abcdefghijk', title: 'Flush video' }]);
    instance.roomService.updatePlayback(created.room.id, created.playerKey, {
        state: 'playing', positionSec: 12.5, durationSec: 180, videoId: 'abcdefghijk',
    });
    await instance.stop();

    const reopened = new AppDatabase(filename, { logger: quietLogger() });
    const restored = reopened.loadActiveRooms()[0];
    assert.equal(restored.playback.state, 'playing');
    assert.equal(restored.playback.positionSec, 12.5);
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('first owner requires a one-time bootstrap code and receives a revocable session', async () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'admin-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new AdminService({
        db,
        config,
        logger: quietLogger(),
        verifyGoogleToken: async () => ({ subject: 'google-subject-1', email: 'owner@example.com', displayName: 'Owner' }),
    });
    const bootstrap = service.createBootstrapCode();
    const login = await service.loginWithGoogle({ idToken: 'credential', bootstrapCode: bootstrap.code });
    assert.equal(login.user.role, 'owner');
    assert.equal(db.ownerCount(), 1);
    assert.throws(() => service.createBootstrapCode(), /owner already exists/i);
    assert.ok(db.adminSession(service.digest(login.token)));
    assert.equal(db.revokeAdminSession(service.digest(login.token)), 1);
    assert.equal(db.adminSession(service.digest(login.token)), undefined);
    db.close();
});

test('closed room history is minimized and purged before thirty days', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', historyRetentionMs: 29 * 24 * 60 * 60 * 1000 }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const registration = service.registerController(created.room.id, created.registrationToken, 'Private Name');
    service.addVideos(created.room.id, registration.controllerKey, [{ id: 'abcdefghijk', title: 'History video' }]);
    service.closeRoom(created.room.id, 'test');
    const detail = db.roomDetail(created.room.id);
    assert.equal(detail.videos[0].title, 'History video');
    const identityRows = db.db.prepare('SELECT COUNT(*) count FROM room_controllers WHERE room_id=?').get(created.room.id).count;
    assert.equal(identityRows, 0);
    assert.deepEqual(detail.events.map((event) => event.type), ['room_closed']);
    const closedRow = db.db.prepare('SELECT round_robin_json FROM rooms WHERE id=?').get(created.room.id);
    assert.deepEqual(JSON.parse(closedRow.round_robin_json).participants, []);
    const purge = db.purgeExpired(Date.now() + 1);
    assert.equal(purge.rooms, 1);
    assert.equal(db.roomDetail(created.room.id), null);
    db.close();
});

test('admin HTTP session uses secure cookies, CSRF, RBAC, and read-only room APIs', async () => {
    const config = loadConfig({
        nodeEnv: 'test', databasePath: ':memory:', port: 0, tokenPepper: 'http-admin-pepper',
        googleClientId: 'test-client-id', secureCookies: false,
    }, quietLogger());
    const instance = createServer({
        config,
        logger: quietLogger(),
        verifyGoogleToken: async () => ({ subject: 'http-owner-sub', email: 'http-owner@example.com', displayName: 'HTTP Owner' }),
    });
    await instance.start(0);
    runtimes.push(instance);
    const base = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const bootstrap = instance.adminService.createBootstrapCode();
    const login = await fetch(`${base}/api/admin/login/google`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'test-credential', bootstrapCode: bootstrap.code }),
    });
    assert.equal(login.status, 200);
    const body = await login.json();
    assert.equal(body.user.role, 'owner');
    const setCookies = login.headers.getSetCookie();
    const requestCookie = setCookies.map((value) => value.split(';')[0]).join('; ');
    const session = await fetch(`${base}/api/admin/session`, { headers: { cookie: requestCookie } });
    assert.equal(session.status, 200);
    const rooms = await fetch(`${base}/api/admin/rooms`, { headers: { cookie: requestCookie } });
    assert.equal(rooms.status, 200);

    const noCsrf = await fetch(`${base}/api/admin/invites`, {
        method: 'POST', headers: { cookie: requestCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'viewer@example.com', role: 'viewer' }),
    });
    assert.equal(noCsrf.status, 403);
    const invited = await fetch(`${base}/api/admin/invites`, {
        method: 'POST', headers: { cookie: requestCookie, 'x-csrf-token': body.csrfToken, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'viewer@example.com', role: 'viewer' }),
    });
    assert.equal(invited.status, 201);

    const operator = instance.db.createAdminWithIdentity({
        id: 'quota-admin', email: 'quota-admin@example.com', displayName: 'Quota Admin', role: 'admin',
        provider: 'google', subject: 'quota-admin-subject',
    });
    const operatorSession = instance.adminService.createSession(operator.id);
    const quotaUpdate = await fetch(`${base}/api/admin/usage/limits`, {
        method: 'PATCH', headers: {
            cookie: `ytkt_admin_session=${encodeURIComponent(operatorSession.token)}`,
            'x-csrf-token': operatorSession.csrfToken,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ limits: { search_calls: 500, general_units: 25000 } }),
    });
    assert.equal(quotaUpdate.status, 200);
    const updatedUsage = await quotaUpdate.json();
    assert.equal(updatedUsage.quotaLimits.find((entry) => entry.bucket === 'search_calls').effectiveDailyLimit, 500);
    assert.equal(updatedUsage.quotaLimits.find((entry) => entry.bucket === 'general_units').isCustom, true);
    assert.equal(instance.db.youtubeQuotaLimits().general_units, 25000);
});

test('YouTube quota limit overrides survive a database restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ytkt-quota-'));
    const filename = path.join(directory, 'quota.sqlite');
    const db = new AppDatabase(filename, { logger: quietLogger() });
    db.updateYoutubeQuotaLimits({ search_calls: 1200, general_units: 40000 }, null);
    db.close();

    const reopened = new AppDatabase(filename, { logger: quietLogger() });
    assert.deepEqual(reopened.youtubeQuotaLimits(), { general_units: 40000, search_calls: 1200 });
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('YouTube usage records separate quota buckets and count failed requests', async () => {
    let calls = 0;
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', youtubeApiKey: 'quota-key' }, quietLogger());
    const instance = createServer({
        config,
        logger: quietLogger(),
        fetchImpl: async (url) => {
            calls += 1;
            if (url.includes('/search?')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
            return new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 });
        },
    });
    const created = instance.roomService.createRoom();
    await instance.youtubeService.search('karaoke', null, created.room.id);
    await assert.rejects(() => instance.youtubeService.lookupVideos(['abcdefghijk'], created.room.id), /YouTube request failed/);
    const summary = instance.youtubeService.usageSummary();
    assert.equal(calls, 2);
    assert.equal(summary.rows.find((row) => row.method === 'search.list').bucket, 'search_calls');
    assert.equal(summary.rows.find((row) => row.method === 'videos.list').failures, 1);
    assert.equal(summary.buckets.find((row) => row.bucket === 'search_calls').defaultDailyLimit, 100);
    assert.deepEqual(summary.catalog.find((row) => row.method === 'videos.insert'), {
        method: 'videos.insert', bucket: 'video_upload_calls', cost: 1, defaultDailyLimit: 100,
        effectiveDailyLimit: 100, usedByApplication: false,
    });
    instance.youtubeService.updateQuotaLimits({ search_calls: 750 }, null);
    const customized = instance.youtubeService.usageSummary();
    assert.equal(customized.buckets.find((row) => row.bucket === 'search_calls').effectiveDailyLimit, 750);
    assert.equal(customized.quotaLimits.find((row) => row.bucket === 'search_calls').isCustom, true);
    assert.throws(() => instance.youtubeService.updateQuotaLimits({ unknown_bucket: 10 }, null), /Unknown quota bucket/);
    instance.db.close();
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { io: createClient } = require('socket.io-client');
const { version } = require('../../package.json');
const { AdminService } = require('../../src/server/adminService');
const { loadConfig } = require('../../src/server/config');
const { buildControlUrl, createServer } = require('../../src/server/createServer');
const { AppDatabase } = require('../../src/server/database');
const { RoomService } = require('../../src/server/roomService');

const runtimes = [];

function quietLogger() {
    return { info() {}, warn() {}, error() {} };
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
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
    assert.deepEqual(await allowed.json(), { ok: true, version });

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
        'request-room-state', 'remove-from-queue', 'reorder-queue', 'update-settings', 'playback-state',
        'control-playback',
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

test('authenticated playback controls validate the current item and preserve volume across videos', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'playback-controls-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singer = service.registerController(created.room.id, created.registrationToken, 'Singer');
    service.addVideos(created.room.id, singer.controllerKey, [
        { id: 'aaaaaaaaaaa', title: 'Playing' },
        { id: 'bbbbbbbbbbb', title: 'Next' },
    ]);
    const queueId = created.room.currentVideo.queueId;
    service.updatePlayback(created.room.id, created.playerKey, {
        queueId, videoId: created.room.currentVideo.id, state: 'playing',
        positionSec: 30, durationSec: 120, volume: 100,
    });

    const paused = service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'pause', expectedQueueId: queueId,
    });
    assert.equal(paused.playback.state, 'paused');
    assert.deepEqual(paused.playerCommand, { type: 'pause', queueId });
    assert.equal(service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'seek', expectedQueueId: queueId, positionSec: 500,
    }).playback.positionSec, 120);
    assert.equal(service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'volume', volume: 37.6,
    }).playback.volume, 38);
    assert.equal(service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'play', expectedQueueId: queueId,
    }).playback.state, 'playing');
    assert.throws(() => service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'seek', expectedQueueId: 'stale', positionSec: 15,
    }), /current video changed/i);
    assert.throws(() => service.controlPlayback(created.room.id, singer.controllerKey, {
        type: 'volume', volume: 101,
    }), /between 0 and 100/i);

    service.advance(created.room.id, singer.controllerKey, queueId, 'controller');
    assert.equal(created.room.playback.volume, 38);
    assert.equal(created.room.playback.positionSec, 0);
    db.close();
});

test('controller playback commands are acknowledged and forwarded to the room player', async () => {
    const instance = await runtime({ tokenPepper: 'playback-socket-pepper' });
    const created = instance.roomService.createRoom();
    const singer = instance.roomService.registerController(created.room.id, created.registrationToken, 'Singer');
    instance.roomService.addVideos(created.room.id, singer.controllerKey, [
        { id: 'aaaaaaaaaaa', title: 'Playing' },
    ]);
    instance.roomService.updatePlayback(created.room.id, created.playerKey, {
        queueId: created.room.currentVideo.queueId,
        videoId: created.room.currentVideo.id,
        state: 'playing',
        positionSec: 10,
        durationSec: 120,
    });

    const port = instance.httpServer.address().port;
    const playerSocket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
    const controllerSocket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
    await Promise.all([playerSocket, controllerSocket].map((socket) => new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    })));
    const emit = (socket, event, payload) => new Promise((resolve, reject) => {
        socket.timeout(1000).emit(event, payload, (error, response) => error ? reject(error) : resolve(response));
    });
    await emit(playerSocket, 'join-room-admin', { roomId: created.room.id, playerKey: created.playerKey });
    await emit(controllerSocket, 'auth-controller', { roomId: created.room.id, controllerKey: singer.controllerKey });

    const forwarded = new Promise((resolve) => playerSocket.once('player-command', resolve));
    const response = await emit(controllerSocket, 'control-playback', {
        roomId: created.room.id,
        controllerKey: singer.controllerKey,
        command: { type: 'seek', expectedQueueId: created.room.currentVideo.queueId, positionSec: 55 },
    });
    assert.equal(response.ok, true);
    assert.equal(response.playback.positionSec, 55);
    assert.deepEqual(await forwarded, {
        type: 'seek', queueId: created.room.currentVideo.queueId, positionSec: 55,
    });
    playerSocket.close();
    controllerSocket.close();
});

test('priority additions and room-wide queue reordering preserve the active video', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'priority-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singer = service.registerController(created.room.id, created.registrationToken, 'Singer');
    service.addVideos(created.room.id, singer.controllerKey, [
        { id: 'aaaaaaaaaaa', title: 'Playing' },
        { id: 'bbbbbbbbbbb', title: 'Normal 1' },
        { id: 'ccccccccccc', title: 'Normal 2' },
    ]);
    const playingQueueId = created.room.currentVideo.queueId;
    service.addVideos(created.room.id, singer.controllerKey, [
        { id: 'ddddddddddd', title: 'Priority 1' },
        { id: 'eeeeeeeeeee', title: 'Priority 2' },
    ], { priority: true });
    assert.deepEqual(created.room.queue.map((item) => item.title), ['Priority 1', 'Priority 2', 'Normal 1', 'Normal 2']);
    assert.equal(created.room.currentVideo.queueId, playingQueueId);

    const reversedIds = created.room.queue.map((item) => item.queueId).reverse();
    const reordered = service.reorderQueue(created.room.id, singer.controllerKey, reversedIds);
    assert.equal(reordered.scope, 'room');
    assert.deepEqual(created.room.queue.map((item) => item.queueId), reversedIds);
    assert.throws(() => service.reorderQueue(created.room.id, singer.controllerKey, [reversedIds[0], reversedIds[0]]), /queue changed/i);
    db.close();
});

test('round-robin priority and reordering only change a controller personal order', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'round-robin-order-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singerA = service.registerController(created.room.id, created.registrationToken, 'Singer A');
    const singerB = service.registerController(created.room.id, created.registrationToken, 'Singer B');
    service.updateSettings(created.room.id, singerA.controllerKey, { roundRobinEnabled: true });
    service.addVideos(created.room.id, singerA.controllerKey, [
        { id: 'aaaaaaaaaa1', title: 'A1' }, { id: 'aaaaaaaaaa2', title: 'A2' }, { id: 'aaaaaaaaaa3', title: 'A3' },
    ]);
    service.addVideos(created.room.id, singerB.controllerKey, [
        { id: 'bbbbbbbbbb1', title: 'B1' }, { id: 'bbbbbbbbbb2', title: 'B2' },
    ]);
    service.addVideos(created.room.id, singerA.controllerKey, [{ id: 'aaaaaaaaaa0', title: 'A0' }], { priority: true });
    service.addVideos(created.room.id, singerB.controllerKey, [{ id: 'bbbbbbbbbb0', title: 'B0' }], { priority: true });
    assert.deepEqual(created.room.queue.map((item) => item.title), ['B0', 'A0', 'B1', 'A2', 'B2', 'A3']);

    const reversedAIds = created.room.queue.filter((item) => item.controllerId === singerA.controller.id)
        .map((item) => item.queueId).reverse();
    const reordered = service.reorderQueue(created.room.id, singerA.controllerKey, reversedAIds);
    assert.equal(reordered.scope, 'controller');
    assert.deepEqual(created.room.queue.map((item) => item.title), ['B0', 'A3', 'B1', 'A2', 'B2', 'A0']);
    assert.deepEqual(created.room.queue.filter((item) => item.controllerId === singerB.controller.id).map((item) => item.title), ['B0', 'B1', 'B2']);
    assert.throws(
        () => service.reorderQueue(created.room.id, singerB.controllerKey, created.room.queue.map((item) => item.queueId)),
        /only allows reordering your own/i
    );
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

test('round-robin resumes the rotation when the current singer has nothing queued', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'rotation-resume-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singerA = service.registerController(created.room.id, created.registrationToken, 'Singer A');
    const singerB = service.registerController(created.room.id, created.registrationToken, 'Singer B');
    const singerC = service.registerController(created.room.id, created.registrationToken, 'Singer C');
    service.updateSettings(created.room.id, singerA.controllerKey, { roundRobinEnabled: true });

    // Singer B's only video becomes the current video, so B holds the rotation
    // position while owning nothing in the pending queue.
    service.addVideos(created.room.id, singerB.controllerKey, [{ id: 'bbbbbbbbbb1', title: 'B1' }]);
    service.addVideos(created.room.id, singerA.controllerKey, [
        { id: 'aaaaaaaaaa1', title: 'A1' }, { id: 'aaaaaaaaaa2', title: 'A2' },
    ]);
    service.addVideos(created.room.id, singerC.controllerKey, [
        { id: 'cccccccccc1', title: 'C1' }, { id: 'cccccccccc2', title: 'C2' },
    ]);

    assert.equal(created.room.currentVideo.title, 'B1');
    assert.equal(created.room.roundRobin.lastServedControllerId, singerB.controller.id);
    // Singer C registered after B, so C takes the next turn. Resolving the
    // rotation against only the controllers holding queued videos would lose
    // B's position and hand the turn back to the earliest-registered singer.
    assert.deepEqual(created.room.queue.map((item) => item.title), ['C1', 'A1', 'C2', 'A2']);
    db.close();
});

test('round-robin never starves a controller that keeps videos queued', () => {
    // Property: between two consecutive turns for one controller, every other
    // controller that held queued videos for that entire interval must be
    // served at least once. Seeded so any failure replays deterministically.
    for (let seed = 1; seed <= 12; seed += 1) {
        const random = seededRandom(seed);
        const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'starvation-pepper' }, quietLogger());
        const db = new AppDatabase(':memory:', { logger: quietLogger() });
        const service = new RoomService({ db, config, logger: quietLogger() });
        const created = service.createRoom();
        const room = created.room;
        const singers = ['A', 'B', 'C', 'D'].map((name) => service.registerController(room.id, created.registrationToken, name));
        service.updateSettings(room.id, singers[0].controllerKey, { roundRobinEnabled: true });
        const turns = [];
        let videoNumber = 0;

        for (let step = 0; step < 150; step += 1) {
            const singer = singers[Math.floor(random() * singers.length)];
            if (random() < 0.5 && room.queue.length < 20) {
                videoNumber += 1;
                service.addVideos(room.id, singer.controllerKey, [
                    { id: `video${String(videoNumber).padStart(6, '0')}`, title: `Video ${videoNumber}` },
                ], { priority: random() < 0.25 });
            } else if (room.currentVideo) {
                const waiting = new Set(room.queue.map((item) => item.controllerId));
                const result = service.advance(room.id, singer.controllerKey, room.currentVideo.queueId, 'controller');
                if (result.advanced && room.currentVideo) {
                    turns.push({ served: room.currentVideo.controllerId, waiting });
                }
            }
        }
        db.close();

        for (let first = 0; first < turns.length; first += 1) {
            const next = turns.findIndex((turn, index) => index > first && turn.served === turns[first].served);
            if (next < 0) continue;
            const servedBetween = new Set(turns.slice(first + 1, next + 1).map((turn) => turn.served));
            const interval = turns.slice(first, next + 1);
            for (const candidate of turns[first].waiting) {
                if (candidate === turns[first].served || servedBetween.has(candidate)) continue;
                assert.ok(
                    !interval.every((turn) => turn.waiting.has(candidate)),
                    `seed ${seed}: a controller kept videos queued through a full rotation without receiving a turn`
                );
            }
        }
    }
});

test('removing the last served controller hands the rotation to their predecessor', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'kick-handoff-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singerA = service.registerController(created.room.id, created.registrationToken, 'Singer A');
    const singerB = service.registerController(created.room.id, created.registrationToken, 'Singer B');
    const singerC = service.registerController(created.room.id, created.registrationToken, 'Singer C');
    service.updateSettings(created.room.id, singerA.controllerKey, { roundRobinEnabled: true });

    // Draining the room is the only way B can hold the rotation without owning
    // the current video, which is what lets the removal below reach the branch.
    service.addVideos(created.room.id, singerB.controllerKey, [{ id: 'bbbbbbbbbb1', title: 'B1' }]);
    service.advance(created.room.id, singerB.controllerKey, created.room.currentVideo.queueId, 'controller');
    assert.equal(created.room.currentVideo, null);
    assert.equal(created.room.roundRobin.lastServedControllerId, singerB.controller.id);

    service.removeController(created.room.id, created.playerKey, singerB.controller.id);
    assert.deepEqual(created.room.roundRobin.participants, [singerA.controller.id, singerC.controller.id]);
    // Resuming from A means the next turn falls to C, B's successor in the ring.
    assert.equal(created.room.roundRobin.lastServedControllerId, singerA.controller.id);
    db.close();
});

test('queue items without a controller keep a rotation slot and stay out of the ring', () => {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: 'orphan-pepper' }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singerA = service.registerController(created.room.id, created.registrationToken, 'Singer A');
    const singerB = service.registerController(created.room.id, created.registrationToken, 'Singer B');
    const singerC = service.registerController(created.room.id, created.registrationToken, 'Singer C');
    service.updateSettings(created.room.id, singerA.controllerKey, { roundRobinEnabled: true });
    service.addVideos(created.room.id, singerA.controllerKey, [
        { id: 'aaaaaaaaaa1', title: 'A1' }, { id: 'aaaaaaaaaa2', title: 'A2' },
    ]);
    service.addVideos(created.room.id, singerB.controllerKey, [
        { id: 'bbbbbbbbbb1', title: 'B1' }, { id: 'bbbbbbbbbb2', title: 'B2' },
    ]);
    service.addVideos(created.room.id, singerC.controllerKey, [
        { id: 'cccccccccc1', title: 'C1' }, { id: 'cccccccccc2', title: 'C2' },
    ]);

    // Stand in for a restored room whose controller rows were cleared: the queue
    // items survive with no owner while other controllers still hold the ring.
    const queued = created.room.queue.map((item) => String(item.queueId)).sort();
    for (const item of created.room.queue) {
        if (item.controllerId === singerC.controller.id) delete item.controllerId;
    }
    service.reorderRoundRobin(created.room);

    assert.deepEqual(created.room.queue.map((item) => String(item.queueId)).sort(), queued);
    assert.equal(created.room.roundRobin.participants.includes('unknown'), false);
    assert.equal(created.room.roundRobin.participants.every((id) => typeof id === 'string'), true);
    db.close();
});

test('a reorder that changes nothing is still persisted and broadcast', async () => {
    const instance = await runtime({ tokenPepper: 'reorder-noop-pepper' });
    const created = instance.roomService.createRoom();
    const singer = instance.roomService.registerController(created.room.id, created.registrationToken, 'Singer');
    instance.roomService.addVideos(created.room.id, singer.controllerKey, [
        { id: 'aaaaaaaaaa1', title: 'One' }, { id: 'aaaaaaaaaa2', title: 'Two' }, { id: 'aaaaaaaaaa3', title: 'Three' },
    ]);
    const versionBefore = created.room.version;
    const currentOrder = created.room.queue.map((item) => item.queueId);

    const port = instance.httpServer.address().port;
    const socket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    await new Promise((resolve, reject) => {
        socket.timeout(1000).emit('auth-controller', { roomId: created.room.id, controllerKey: singer.controllerKey },
            (error, response) => error ? reject(error) : resolve(response));
    });

    const broadcast = new Promise((resolve) => socket.once('queue-updated', resolve));
    const acknowledgement = await new Promise((resolve, reject) => {
        socket.timeout(1000).emit('reorder-queue', {
            roomId: created.room.id, controllerKey: singer.controllerKey, orderedQueueIds: currentOrder,
        }, (error, response) => error ? reject(error) : resolve(response));
    });
    assert.equal(acknowledgement.ok, true);
    assert.equal(acknowledgement.changed, false);
    assert.deepEqual((await broadcast).map((item) => item.queueId), currentOrder);
    assert.ok(created.room.version > versionBefore, 'an unchanged reorder must still write the room back');
    socket.close();
});

function playbackRoom(pepper) {
    const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', tokenPepper: pepper }, quietLogger());
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const counters = { saves: 0 };
    const saveRoom = db.saveRoom.bind(db);
    db.saveRoom = (room) => { counters.saves += 1; return saveRoom(room); };
    const service = new RoomService({ db, config, logger: quietLogger() });
    const created = service.createRoom();
    const singer = service.registerController(created.room.id, created.registrationToken, 'Singer');
    service.addVideos(created.room.id, singer.controllerKey, [{ id: 'aaaaaaaaaa1', title: 'Playing' }]);
    return { config, db, service, created, counters };
}

test('a player repeating the same paused snapshot stops rewriting the room', () => {
    const { db, service, created, counters } = playbackRoom('checkpoint-pepper');
    const roomId = created.room.id;
    const publish = (state, positionSec) => service.updatePlayback(roomId, created.playerKey, {
        state, positionSec, durationSec: 120,
    });

    publish('playing', 5);
    counters.saves = 0;
    // Coming to rest is worth persisting exactly once.
    publish('paused', 10);
    assert.equal(counters.saves, 1);

    // Pretend the checkpoint interval has elapsed, so only the unchanged-snapshot
    // guard is left to stop the write.
    service.lastPlaybackCheckpoint.get(roomId).at -= 60_000;
    counters.saves = 0;
    for (let tick = 0; tick < 20; tick += 1) publish('paused', 10);
    assert.equal(counters.saves, 0, 'a paused room must not be rewritten once per snapshot');

    // Resuming is new information again.
    publish('playing', 10);
    assert.equal(counters.saves, 1);

    // So is the position actually advancing after the interval elapses.
    service.lastPlaybackCheckpoint.get(roomId).at -= 60_000;
    counters.saves = 0;
    publish('playing', 25);
    assert.equal(counters.saves, 1);
    db.close();
});

test('only advancing playback keeps a room clear of the inactivity sweep', () => {
    const { config, db, service, created, counters } = playbackRoom('inactivity-pepper');
    const roomId = created.room.id;
    const goStale = () => { created.room.lastActivityAt = Date.now() - config.inactivityMs - 1_000; };
    const publish = (state, positionSec) => service.updatePlayback(roomId, created.playerKey, {
        state, positionSec, durationSec: 120,
    });

    goStale();
    publish('playing', 20);
    assert.deepEqual(service.expireInactive(), [], 'active playback is room activity');

    goStale();
    publish('paused', 20);
    assert.deepEqual(service.expireInactive(), [roomId], 'a paused tab left open must not hold the room open');
    assert.ok(counters.saves > 0);
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
        { id: 'lmnopqrstuv', title: 'Persisted queue 1' },
        { id: 'wxyzABCDEFG', title: 'Persisted queue 2' },
    ]);
    service.addVideos(created.room.id, registration.controllerKey, [
        { id: 'hijklmnopqr', title: 'Persisted priority' },
    ], { priority: true });
    service.reorderQueue(
        created.room.id,
        registration.controllerKey,
        created.room.queue.map((item) => item.queueId).reverse()
    );
    service.controlPlayback(created.room.id, registration.controllerKey, { type: 'volume', volume: 42 });
    db.close();

    db = new AppDatabase(filename, { logger: quietLogger() });
    service = new RoomService({ db, config, logger: quietLogger() });
    const restored = service.requireRoom(created.room.id);
    assert.equal(restored.currentVideo.title, 'Persisted current');
    assert.deepEqual(restored.queue.map((item) => item.title), [
        'Persisted queue 2', 'Persisted queue 1', 'Persisted priority',
    ]);
    assert.equal(restored.playback.volume, 42);
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

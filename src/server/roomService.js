const crypto = require('crypto');
const { AppError, cleanText, generateToken, isIdentifier, tokenDigest } = require('./security');

const PLAYBACK_STATES = new Set(['unstarted', 'ended', 'playing', 'paused', 'buffering', 'cued']);
const PLAYBACK_COMMANDS = new Set(['play', 'pause', 'seek', 'volume']);
const MAX_SEEK_SECONDS = 24 * 60 * 60;
// Queue items whose controller record has gone share one rotation slot. Held
// outside the persisted participant ring so it cannot accumulate there.
const ORPHANED_PARTICIPANT = Symbol('orphaned participant');

function normalizeVolume(value, fallback = 100) {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback;
}

class RoomService {
    constructor({ db, config, logger = console }) {
        this.db = db;
        this.config = config;
        this.logger = logger;
        this.rooms = new Map();
        this.connections = new Map();
        this.lastPlaybackCheckpoint = new Map();
        this.loadActiveRooms();
    }

    loadActiveRooms() {
        const now = Date.now();
        for (const room of this.db.loadActiveRooms()) {
            if (now - room.lastActivityAt >= this.config.inactivityMs) {
                this.db.closeRoom(room.id, 'expired_during_downtime', now);
                continue;
            }
            if (!Object.hasOwn(room.roundRobin, 'lastServedControllerId')) {
                room.roundRobin.lastServedControllerId = room.roundRobin.participants[room.roundRobin.lastServedIdx] || null;
                delete room.roundRobin.lastServedIdx;
            }
            room.playback.volume = normalizeVolume(room.playback.volume);
            this.rooms.set(room.id, room);
        }
        this.logger.info(`[INFO] Restored ${this.rooms.size} active room(s) from SQLite.`);
    }

    createRoom({ issueRegistrationInvite = true } = {}) {
        if (this.rooms.size >= this.config.limits.maxRooms) {
            throw new AppError('room_limit', 'Room limit reached. Please try again later.', 503);
        }
        const now = Date.now();
        const playerKey = generateToken();
        const room = {
            id: crypto.randomUUID(),
            status: 'active',
            createdAt: now,
            lastActivityAt: now,
            closedAt: null,
            closeReason: null,
            playerKeyHash: this.digest(playerKey),
            settings: { roundRobinEnabled: false },
            roundRobin: { participants: [], lastServedControllerId: null },
            currentVideo: null,
            playback: {
                state: 'unstarted',
                positionSec: 0,
                durationSec: null,
                updatedAt: now,
                videoId: null,
                queueId: null,
                volume: 100,
            },
            allowNewControllers: true,
            nextQueueId: 1,
            version: 1,
            controllers: new Map(),
            queue: [],
        };
        this.rooms.set(room.id, room);
        this.db.saveRoom(room);
        this.db.recordRoomEvent(room.id, 'room_created');
        const invite = issueRegistrationInvite ? this.createRegistrationInvite(room.id) : null;
        return { room, playerKey, registrationToken: invite?.token };
    }

    digest(token) {
        return tokenDigest(token, this.config.tokenPepper);
    }

    get(roomId) {
        if (!isIdentifier(roomId, 128)) return null;
        return this.rooms.get(roomId) || null;
    }

    requireRoom(roomId) {
        const room = this.get(roomId);
        if (!room) throw new AppError('room_not_found', 'Room not found', 404);
        return room;
    }

    validatePlayer(room, token) {
        if (!token || this.digest(token) !== room.playerKeyHash) {
            throw new AppError('invalid_player', 'Invalid player key', 401);
        }
        return true;
    }

    controller(room, token, { allowDisabled = false } = {}) {
        if (!token) throw new AppError('invalid_controller', 'Invalid controller key', 401);
        const controller = room.controllers.get(this.digest(token));
        if (!controller) throw new AppError('invalid_controller', 'Invalid controller key', 401);
        if (controller.removedAt) throw new AppError('controller_removed', 'Controller has been removed', 401);
        if (!controller.enabled && !allowDisabled) throw new AppError('controller_disabled', 'Controller has been disabled', 403);
        return controller;
    }

    authorizeSearch(roomId, token) {
        const room = this.get(roomId);
        if (!room || !token) return null;
        const controller = room.controllers.get(this.digest(token));
        return controller && controller.enabled && !controller.removedAt ? { room, controller } : null;
    }

    createRegistrationInvite(roomId) {
        const room = this.requireRoom(roomId);
        const token = generateToken();
        const now = Date.now();
        this.db.createRegistrationInvite({
            id: crypto.randomUUID(),
            roomId: room.id,
            tokenHash: this.digest(token),
            createdAt: now,
            expiresAt: now + this.config.inviteTtlMs,
        });
        return { token, expiresAt: now + this.config.inviteTtlMs };
    }

    validateRegistrationInvite(room, token) {
        if (!token) throw new AppError('invalid_invite', 'Invalid or expired registration link', 401);
        const invite = this.db.registrationInvite(this.digest(token));
        if (!invite || invite.room_id !== room.id) throw new AppError('invalid_invite', 'Invalid or expired registration link', 401);
        return invite;
    }

    validateUsername(value) {
        const name = cleanText(value, this.config.limits.maxUsernameLength + 1);
        if (!name) throw new AppError('invalid_username', 'Username cannot be empty');
        if (name.includes('[') || name.includes(']')) throw new AppError('invalid_username', 'Please remove [ or ] characters.');
        if (name.length > this.config.limits.maxUsernameLength) {
            throw new AppError('invalid_username', `Username must be ${this.config.limits.maxUsernameLength} characters or less.`);
        }
        return name;
    }

    uniqueUsername(room, baseName, excludeId = null) {
        const names = new Set([...room.controllers.values()]
            .filter((controller) => !controller.removedAt && controller.id !== excludeId)
            .map((controller) => controller.name));
        if (!names.has(baseName)) return baseName;
        let suffix = 2;
        while (names.has(`${baseName} [${suffix}]`)) suffix += 1;
        return `${baseName} [${suffix}]`;
    }

    registerController(roomId, inviteToken, username) {
        const room = this.requireRoom(roomId);
        this.validateRegistrationInvite(room, inviteToken);
        if (!room.allowNewControllers) throw new AppError('registration_disabled', 'New controller registration is disabled for this room', 403);
        if ([...room.controllers.values()].filter((controller) => !controller.removedAt).length >= this.config.limits.maxControllersPerRoom) {
            throw new AppError('controller_limit', 'Room is at maximum controller capacity', 409);
        }
        const token = generateToken();
        const tokenHash = this.digest(token);
        const now = Date.now();
        const controller = {
            id: crypto.randomUUID(),
            tokenHash,
            name: this.uniqueUsername(room, this.validateUsername(username)),
            enabled: true,
            createdAt: now,
            removedAt: null,
            colorHue: crypto.randomInt(0, 360),
        };
        room.controllers.set(tokenHash, controller);
        this.upsertParticipant(room, controller.id);
        this.mutate(room, 'controller_registered', { controllerId: controller.id });
        this.db.updateRoomMetrics(room.id, { registeredDelta: 1 });
        return { controller, controllerKey: token };
    }

    renameController(roomId, token, newName) {
        const room = this.requireRoom(roomId);
        const controller = this.controller(room, token);
        const uniqueName = this.uniqueUsername(room, this.validateUsername(newName), controller.id);
        controller.name = uniqueName;
        for (const item of room.queue) if (item.controllerId === controller.id) item.addedBy = uniqueName;
        if (room.currentVideo?.controllerId === controller.id) room.currentVideo.addedBy = uniqueName;
        this.mutate(room, 'controller_renamed', { controllerId: controller.id });
        return controller;
    }

    updateControllerColor(roomId, token, colorHue) {
        const room = this.requireRoom(roomId);
        const controller = this.controller(room, token);
        if (!Number.isFinite(colorHue) || colorHue < 0 || colorHue >= 360) throw new AppError('invalid_color', 'Color hue must be between 0 and 359');
        controller.colorHue = Math.floor(colorHue);
        for (const item of room.queue) if (item.controllerId === controller.id) item.colorHue = controller.colorHue;
        if (room.currentVideo?.controllerId === controller.id) room.currentVideo.colorHue = controller.colorHue;
        this.mutate(room, 'controller_color_updated', { controllerId: controller.id });
        return controller;
    }

    toggleController(roomId, playerKey, controllerId, enabled) {
        const room = this.requireRoom(roomId);
        this.validatePlayer(room, playerKey);
        const controller = [...room.controllers.values()].find((entry) => entry.id === controllerId && !entry.removedAt);
        if (!controller) throw new AppError('controller_not_found', 'Controller not found', 404);
        controller.enabled = Boolean(enabled);
        this.mutate(room, 'controller_toggled', { controllerId, enabled: controller.enabled });
        return controller;
    }

    removeController(roomId, playerKey, controllerId) {
        const room = this.requireRoom(roomId);
        this.validatePlayer(room, playerKey);
        const entry = [...room.controllers.entries()].find(([, controller]) => controller.id === controllerId && !controller.removedAt);
        if (!entry) throw new AppError('controller_not_found', 'Controller not found', 404);
        const [, controller] = entry;
        controller.enabled = false;
        controller.removedAt = Date.now();
        if (!room.queue.some((item) => item.controllerId === controllerId) && room.currentVideo?.controllerId !== controllerId) {
            this.removeParticipant(room, controllerId);
        }
        this.mutate(room, 'controller_removed', { controllerId });
        return controller;
    }

    toggleRegistration(roomId, playerKey, allow) {
        const room = this.requireRoom(roomId);
        this.validatePlayer(room, playerKey);
        room.allowNewControllers = Boolean(allow);
        this.mutate(room, 'registration_toggled', { allow: room.allowNewControllers });
        return room.allowNewControllers;
    }

    sanitizeVideo(video) {
        if (!video || typeof video !== 'object' || Array.isArray(video)) throw new AppError('invalid_video', 'Invalid video data');
        const id = cleanText(video.id, this.config.limits.maxVideoIdLength + 1);
        const title = cleanText(video.title, this.config.limits.maxVideoTitleLength + 1);
        if (!id || id.length > this.config.limits.maxVideoIdLength || !isIdentifier(id, this.config.limits.maxVideoIdLength)) {
            throw new AppError('invalid_video', 'Invalid YouTube video ID');
        }
        if (!title || title.length > this.config.limits.maxVideoTitleLength) throw new AppError('invalid_video', 'Invalid video title');
        return {
            id,
            title,
            channelTitle: cleanText(video.channelTitle, 200),
            thumbnailUrl: typeof video.thumbnailUrl === 'string' && /^https:\/\//.test(video.thumbnailUrl) ? video.thumbnailUrl.slice(0, 1000) : undefined,
            sourcePlaylistId: video.sourcePlaylistId ? cleanText(video.sourcePlaylistId, 128) : undefined,
            madeForKids: Boolean(video.madeForKids),
        };
    }

    addVideos(roomId, token, videos, { priority = false } = {}) {
        const room = this.requireRoom(roomId);
        const previousCurrentQueueId = room.currentVideo?.queueId || null;
        const controller = this.controller(room, token);
        if (!Array.isArray(videos) || videos.length === 0) throw new AppError('invalid_video', 'No videos were provided');
        const capacity = this.remainingQueueCapacity(room);
        if (capacity <= 0) throw new AppError('queue_full', 'Queue is at maximum capacity', 409);
        const accepted = videos.slice(0, capacity).map((video) => {
            const cleaned = this.sanitizeVideo(video);
            return {
                ...cleaned,
                queueId: String(room.nextQueueId++),
                controllerId: controller.id,
                addedBy: controller.name,
                colorHue: controller.colorHue,
                queuedAt: Date.now(),
                apiDataRefreshedAt: Date.now(),
            };
        });
        if (!room.currentVideo && accepted.length > 0) this.setCurrentVideo(room, accepted.shift());
        if (priority && accepted.length > 0) {
            if (room.settings.roundRobinEnabled) {
                const firstOwnedIndex = room.queue.findIndex((item) => item.controllerId === controller.id);
                room.queue.splice(firstOwnedIndex < 0 ? room.queue.length : firstOwnedIndex, 0, ...accepted);
            } else {
                room.queue.unshift(...accepted);
            }
        } else {
            room.queue.push(...accepted);
        }
        this.reorderRoundRobin(room);
        const addedCount = videos.length > capacity ? capacity : videos.length;
        this.mutate(room, 'videos_queued', { count: addedCount, priority: Boolean(priority) });
        this.db.updateRoomMetrics(room.id, { queuedDelta: addedCount });
        return {
            addedCount,
            skippedCount: videos.length - addedCount,
            currentChanged: (room.currentVideo?.queueId || null) !== previousCurrentQueueId,
            room,
        };
    }

    remainingQueueCapacity(room) {
        return Math.max(0, this.config.limits.maxQueueLengthPerRoom - room.queue.length - (room.currentVideo ? 1 : 0));
    }

    removeFromQueue(roomId, token, queueId) {
        const room = this.requireRoom(roomId);
        this.controller(room, token);
        const index = room.queue.findIndex((item) => String(item.queueId) === String(queueId));
        if (index < 0) throw new AppError('queue_item_not_found', 'Queue item was already removed or advanced', 404);
        const [removed] = room.queue.splice(index, 1);
        this.db.setQueueItemStatus(room.id, removed.queueId, 'removed');
        this.reorderRoundRobin(room);
        this.pruneParticipant(room, removed.controllerId);
        this.mutate(room, 'queue_item_removed', { queueId: String(queueId) });
        return removed;
    }

    reorderQueue(roomId, token, orderedQueueIds) {
        const room = this.requireRoom(roomId);
        const controller = this.controller(room, token);
        if (!Array.isArray(orderedQueueIds) || orderedQueueIds.length > this.config.limits.maxQueueLengthPerRoom) {
            throw new AppError('invalid_queue_order', 'Queue order must be a bounded list of queue item IDs');
        }
        const normalizedIds = orderedQueueIds.map((queueId) => {
            if (!isIdentifier(queueId, 128)) throw new AppError('invalid_queue_order', 'Queue order contains an invalid item ID');
            return String(queueId);
        });
        const scopedItems = room.settings.roundRobinEnabled
            ? room.queue.filter((item) => item.controllerId === controller.id)
            : room.queue;
        const expectedIds = new Set(scopedItems.map((item) => String(item.queueId)));
        const providedIds = new Set(normalizedIds);
        if (normalizedIds.length !== scopedItems.length || providedIds.size !== normalizedIds.length ||
            normalizedIds.some((queueId) => !expectedIds.has(queueId))) {
            throw new AppError(
                'queue_order_conflict',
                room.settings.roundRobinEnabled
                    ? 'Round-robin mode only allows reordering your own current queue items'
                    : 'The queue changed before the reorder could be applied',
                409
            );
        }

        const before = room.queue.map((item) => String(item.queueId));
        const scopedItemsById = new Map(scopedItems.map((item) => [String(item.queueId), item]));
        const orderedItems = normalizedIds.map((queueId) => scopedItemsById.get(queueId));
        if (room.settings.roundRobinEnabled) {
            let ownedIndex = 0;
            room.queue = room.queue.map((item) => item.controllerId === controller.id ? orderedItems[ownedIndex++] : item);
            this.reorderRoundRobin(room);
        } else {
            room.queue = orderedItems;
        }
        const after = room.queue.map((item) => String(item.queueId));
        const changed = before.some((queueId, index) => queueId !== after[index]);
        if (changed) {
            this.mutate(room, 'queue_reordered', {
                controllerId: controller.id,
                scope: room.settings.roundRobinEnabled ? 'controller' : 'room',
                count: normalizedIds.length,
            });
        } else {
            // A no-op earns no audit event, but the rebuild above can still have
            // extended the participant ring, so the room must be written back.
            this.touchAuthenticated(room);
        }
        return { changed, scope: room.settings.roundRobinEnabled ? 'controller' : 'room', room };
    }

    advance(roomId, credential, expectedQueueId, actor = 'controller') {
        const room = this.requireRoom(roomId);
        if (actor === 'player') this.validatePlayer(room, credential);
        else this.controller(room, credential);
        if (!room.currentVideo) return { advanced: false, reason: 'empty' };
        if (!expectedQueueId) throw new AppError('expected_current_required', 'Current queue item ID is required');
        if (String(room.currentVideo.queueId) !== String(expectedQueueId)) {
            return { advanced: false, reason: 'stale', currentQueueId: room.currentVideo.queueId };
        }
        const previous = room.currentVideo;
        const completedStatus = actor === 'player' ? 'played' : 'skipped';
        this.db.setQueueItemStatus(room.id, previous.queueId, completedStatus);
        this.setCurrentVideo(room, room.queue.shift() || null);
        this.pruneParticipant(room, previous.controllerId);
        this.mutate(room, actor === 'player' ? 'video_completed' : 'video_skipped', { queueId: previous.queueId });
        this.db.updateRoomMetrics(room.id, actor === 'player' ? { playedDelta: 1 } : { skippedDelta: 1 });
        return { advanced: true, currentVideo: room.currentVideo };
    }

    updateSettings(roomId, token, settings) {
        const room = this.requireRoom(roomId);
        this.controller(room, token);
        if (!settings || typeof settings.roundRobinEnabled !== 'boolean') throw new AppError('invalid_settings', 'Invalid settings');
        room.settings.roundRobinEnabled = settings.roundRobinEnabled;
        this.reorderRoundRobin(room);
        this.mutate(room, 'settings_updated', { roundRobinEnabled: settings.roundRobinEnabled });
        return room.settings;
    }

    updatePlayback(roomId, playerKey, update) {
        const room = this.requireRoom(roomId);
        this.validatePlayer(room, playerKey);
        if (update.state !== undefined && !PLAYBACK_STATES.has(update.state)) throw new AppError('invalid_playback', 'Invalid playback state');
        const position = update.positionSec;
        const duration = update.durationSec;
        const volume = update.volume;
        if (position !== undefined && (!Number.isFinite(position) || position < 0)) throw new AppError('invalid_playback', 'Invalid playback position');
        if (duration !== undefined && duration !== null && (!Number.isFinite(duration) || duration < 0)) throw new AppError('invalid_playback', 'Invalid playback duration');
        if (volume !== undefined && (!Number.isFinite(volume) || volume < 0 || volume > 100)) throw new AppError('invalid_playback', 'Invalid playback volume');
        if (Number.isFinite(position) && Number.isFinite(duration) && position > duration + 5) throw new AppError('invalid_playback', 'Playback position exceeds duration');
        if (update.queueId !== undefined && update.queueId !== null && String(update.queueId) !== String(room.currentVideo?.queueId)) {
            throw new AppError('stale_playback', 'Playback update is for a stale queue item');
        }
        if (update.videoId !== undefined && update.videoId !== null && update.videoId !== room.currentVideo?.id) {
            throw new AppError('stale_playback', 'Playback update is for a stale video');
        }
        if (update.state !== undefined) room.playback.state = update.state;
        if (position !== undefined) room.playback.positionSec = position;
        if (duration !== undefined) room.playback.durationSec = duration;
        if (volume !== undefined) room.playback.volume = normalizeVolume(volume);
        room.playback.videoId = room.currentVideo?.id || null;
        room.playback.queueId = room.currentVideo?.queueId || null;
        room.playback.updatedAt = Date.now();
        room.lastActivityAt = Date.now();
        const lastCheckpoint = this.lastPlaybackCheckpoint.get(room.id) || 0;
        if (Date.now() - lastCheckpoint >= this.config.playbackCheckpointMs || update.state === 'paused' || update.state === 'ended') {
            room.version += 1;
            this.db.saveRoom(room);
            this.lastPlaybackCheckpoint.set(room.id, Date.now());
        }
        return room.playback;
    }

    controlPlayback(roomId, token, command) {
        const room = this.requireRoom(roomId);
        const controller = this.controller(room, token);
        if (!command || typeof command !== 'object' || Array.isArray(command) || !PLAYBACK_COMMANDS.has(command.type)) {
            throw new AppError('invalid_playback_command', 'Invalid playback command');
        }

        const requiresCurrentVideo = command.type !== 'volume';
        if (requiresCurrentVideo && !room.currentVideo) {
            throw new AppError('nothing_playing', 'There is no current video to control', 409);
        }
        if (requiresCurrentVideo && (command.expectedQueueId === undefined || command.expectedQueueId === null ||
            String(command.expectedQueueId) !== String(room.currentVideo.queueId))) {
            throw new AppError('stale_playback', 'The current video changed before the command was applied', 409);
        }

        const playerCommand = {
            type: command.type,
            queueId: room.currentVideo?.queueId || null,
        };
        if (command.type === 'play') room.playback.state = 'playing';
        if (command.type === 'pause') room.playback.state = 'paused';
        if (command.type === 'seek') {
            if (!Number.isFinite(command.positionSec) || command.positionSec < 0 || command.positionSec > MAX_SEEK_SECONDS) {
                throw new AppError('invalid_playback_command', 'Seek position is invalid');
            }
            const duration = room.playback.durationSec;
            const positionSec = Number.isFinite(duration)
                ? Math.min(command.positionSec, duration)
                : command.positionSec;
            room.playback.positionSec = positionSec;
            playerCommand.positionSec = positionSec;
        }
        if (command.type === 'volume') {
            if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 100) {
                throw new AppError('invalid_playback_command', 'Volume must be between 0 and 100');
            }
            const volume = normalizeVolume(command.volume);
            room.playback.volume = volume;
            playerCommand.volume = volume;
        }

        room.playback.updatedAt = Date.now();
        this.mutate(room, 'playback_controlled', {
            controllerId: controller.id,
            command: command.type,
        });
        return { playback: room.playback, playerCommand };
    }

    setCurrentVideo(room, video) {
        const volume = normalizeVolume(room.playback?.volume);
        room.currentVideo = video;
        if (video) video.startedAt ||= Date.now();
        room.playback = {
            state: 'unstarted',
            positionSec: 0,
            durationSec: null,
            updatedAt: Date.now(),
            videoId: video?.id || null,
            queueId: video?.queueId || null,
            volume,
        };
        if (video?.controllerId) {
            this.upsertParticipant(room, video.controllerId);
            room.roundRobin.lastServedControllerId = video.controllerId;
        }
    }

    upsertParticipant(room, controllerId) {
        if (controllerId && !room.roundRobin.participants.includes(controllerId)) room.roundRobin.participants.push(controllerId);
    }

    removeParticipant(room, controllerId) {
        const participants = room.roundRobin.participants;
        const index = participants.indexOf(controllerId);
        if (index < 0) return;
        if (room.roundRobin.lastServedControllerId === controllerId) {
            // Hand the rotation to the departing controller's predecessor so the
            // next rebuild resumes with their successor rather than restarting at
            // the earliest-registered controller.
            const predecessor = participants[(index - 1 + participants.length) % participants.length];
            room.roundRobin.lastServedControllerId = predecessor === controllerId ? null : predecessor;
        }
        participants.splice(index, 1);
    }

    pruneParticipant(room, controllerId) {
        if (!controllerId) return;
        const activeController = [...room.controllers.values()].some((controller) => controller.id === controllerId && !controller.removedAt);
        const hasVideos = room.currentVideo?.controllerId === controllerId || room.queue.some((item) => item.controllerId === controllerId);
        if (!activeController && !hasVideos) this.removeParticipant(room, controllerId);
    }

    reorderRoundRobin(room) {
        if (!room.settings.roundRobinEnabled || room.queue.length < 2) return;
        const buckets = new Map();
        for (const item of room.queue) {
            const participant = item.controllerId || ORPHANED_PARTICIPANT;
            if (item.controllerId) this.upsertParticipant(room, item.controllerId);
            if (!buckets.has(participant)) buckets.set(participant, []);
            buckets.get(participant).push(item);
        }
        // Rotate the participant ring to resume after the last served controller
        // before dropping the ones holding nothing. The current singer usually
        // owns no queued item, so filtering first loses their ring position and
        // silently restarts the rotation at the earliest-registered controller.
        const ring = room.roundRobin.participants;
        const lastServedIndex = ring.indexOf(room.roundRobin.lastServedControllerId);
        const participants = [];
        for (let step = 1; step <= ring.length; step += 1) {
            const participant = ring[(lastServedIndex + step + ring.length) % ring.length];
            if (buckets.has(participant)) participants.push(participant);
        }
        // Every bucket needs a slot. The interleave below replaces the whole
        // queue, so any bucket left out would have its videos silently dropped.
        for (const participant of buckets.keys()) {
            if (!participants.includes(participant)) participants.push(participant);
        }
        if (participants.length < 2) return;
        const ordered = [];
        let cursor = -1;
        while (ordered.length < room.queue.length) {
            let selected = -1;
            for (let step = 1; step <= participants.length; step += 1) {
                const index = (cursor + step + participants.length) % participants.length;
                if (buckets.get(participants[index])?.length) { selected = index; break; }
            }
            if (selected < 0) break;
            ordered.push(buckets.get(participants[selected]).shift());
            cursor = selected;
        }
        room.queue = ordered;
    }

    mutate(room, eventType, detail = {}) {
        room.lastActivityAt = Date.now();
        room.version += 1;
        this.db.saveRoom(room);
        this.db.recordRoomEvent(room.id, eventType, detail);
    }

    publicState(room) {
        return {
            roomId: room.id,
            status: room.status,
            queue: room.queue,
            currentVideo: room.currentVideo,
            settings: room.settings,
            playback: room.playback,
            createdAt: room.createdAt,
            lastActivityAt: room.lastActivityAt,
            allowNewControllers: room.allowNewControllers,
            version: room.version,
        };
    }

    playerAdminState(room) {
        return {
            ...this.publicState(room),
            controllers: [...room.controllers.values()].filter((controller) => !controller.removedAt).map((controller) => ({
                id: controller.id,
                name: controller.name,
                enabled: controller.enabled,
                createdAt: controller.createdAt,
                colorHue: controller.colorHue,
            })),
        };
    }

    joinConnection(roomId, socketId, role) {
        const room = this.requireRoom(roomId);
        if (!this.connections.has(roomId)) this.connections.set(roomId, new Map());
        this.connections.get(roomId).set(socketId, role);
        if (role === 'controller' || role === 'player') this.touchAuthenticated(room);
        const counts = this.connectionCounts(roomId);
        this.db.updateRoomMetrics(roomId, {
            peakConnectedSockets: counts.total,
            peakPublicViewers: counts.public,
            peakControllers: counts.controllers,
        });
        return counts;
    }

    touchAuthenticated(room) {
        room.lastActivityAt = Date.now();
        room.version += 1;
        this.db.saveRoom(room);
    }

    leaveConnection(roomId, socketId) {
        const registry = this.connections.get(roomId);
        if (!registry) return;
        registry.delete(socketId);
        if (registry.size === 0) this.connections.delete(roomId);
    }

    connectionCounts(roomId) {
        const roles = [...(this.connections.get(roomId)?.values() || [])];
        return {
            total: roles.length,
            public: roles.filter((role) => role === 'public').length,
            controllers: roles.filter((role) => role === 'controller').length,
            players: roles.filter((role) => role === 'player').length,
        };
    }

    controllerCounts(roomId) {
        const room = this.get(roomId);
        if (!room) return { registered: 0, enabled: 0 };
        const active = [...room.controllers.values()].filter((controller) => !controller.removedAt);
        return { registered: active.length, enabled: active.filter((controller) => controller.enabled).length };
    }

    flush() {
        for (const room of this.rooms.values()) this.db.saveRoom(room);
    }

    closeRoom(roomId, reason = 'expired') {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        room.status = 'closed';
        room.closedAt = Date.now();
        room.closeReason = reason;
        this.db.closeRoom(roomId, reason, room.closedAt);
        this.rooms.delete(roomId);
        this.connections.delete(roomId);
        this.lastPlaybackCheckpoint.delete(roomId);
        return true;
    }

    deleteRoomData(roomId, playerKey) {
        const room = this.requireRoom(roomId);
        this.validatePlayer(room, playerKey);
        const deleted = this.db.deleteRoomData(room.id, this.digest(`room:${room.id}`));
        this.rooms.delete(room.id);
        this.connections.delete(room.id);
        this.lastPlaybackCheckpoint.delete(room.id);
        return deleted;
    }

    expireInactive(now = Date.now()) {
        const expired = [];
        for (const room of this.rooms.values()) {
            if (now - room.lastActivityAt >= this.config.inactivityMs) {
                expired.push(room.id);
                this.closeRoom(room.id, 'inactive');
            }
        }
        return expired;
    }

    runRetention(now = Date.now()) {
        return this.db.purgeExpired(now - this.config.historyRetentionMs);
    }

    staleYouTubeVideoIds(cutoff) {
        const ids = [];
        for (const room of this.rooms.values()) {
            for (const item of [room.currentVideo, ...room.queue]) {
                if (item?.id && (item.apiDataRefreshedAt || item.queuedAt || 0) <= cutoff) {
                    ids.push({ roomId: room.id, videoId: item.id });
                }
            }
        }
        return ids;
    }

    refreshYouTubeMetadata(roomId, requestedIds, refreshedVideos, now = Date.now()) {
        const room = this.requireRoom(roomId);
        const requested = new Set(requestedIds);
        const metadata = new Map(refreshedVideos.map((video) => [video.id, video]));
        let changed = false;
        for (const item of [room.currentVideo, ...room.queue]) {
            if (!item || !requested.has(item.id)) continue;
            const update = metadata.get(item.id);
            if (update) {
                item.title = update.title;
                item.channelTitle = update.channelTitle;
                item.thumbnailUrl = update.thumbnailUrl;
                item.madeForKids = update.madeForKids;
            } else {
                item.title = 'Unavailable YouTube video';
                item.channelTitle = '';
                delete item.thumbnailUrl;
            }
            item.apiDataRefreshedAt = now;
            changed = true;
        }
        if (changed) {
            room.version += 1;
            this.db.saveRoom(room);
        }
        return changed;
    }
}

module.exports = { PLAYBACK_STATES, RoomService };

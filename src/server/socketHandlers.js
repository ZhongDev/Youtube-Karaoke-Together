const { FixedWindowLimiter } = require('./rateLimiter');
const { AppError, asObject, isIdentifier } = require('./security');

function errorPayload(event, error) {
    return {
        type: event,
        code: error instanceof AppError ? error.code : 'internal_error',
        message: error instanceof AppError ? error.message : 'The request could not be completed',
    };
}

/** Everything a room member needs to know about the current song's lyrics, minus the text. */
function lyricsStateFor(room, { roomService, lyricsService }) {
    const video = room.currentVideo;
    return {
        enabled: Boolean(room.settings.lyricsEnabled),
        perUser: Boolean(room.settings.lyricsPerUser),
        display: roomService.lyricsDisplay(room),
        queueId: video?.queueId ?? null,
        videoId: video?.id ?? null,
        ...lyricsService.songState(video?.id ?? null, roomService.lyricsOverride(room)),
    };
}

const LYRICS_MEMBER_ROLES = new Set(['player', 'controller']);
// Queued songs this close to their turn are looked up ahead of time.
const LYRICS_PREFETCH_AHEAD = 5;

function registerSocketHandlers(io, { roomService, youtubeService, lyricsService, config, logger = console }) {
    const broadcastLyrics = (room) => io.to(room.id).emit('lyrics-updated', lyricsStateFor(room, { roomService, lyricsService }));

    // Look up the next few queued songs whose lyrics the room will want, so
    // they are cached (with reading aids) before each song starts. Called
    // whenever the front of the queue or the room's lyrics rules change.
    const prefetchLyrics = (room) => {
        for (const item of room.queue.slice(0, LYRICS_PREFETCH_AHEAD)) {
            if (roomService.wantsLyricsFor(room, item.controllerId)) lyricsService.prefetch(item);
        }
    };

    // Called whenever the current video or the room's display rule may have
    // changed: start the lookup if the room display will need it, then tell
    // every member what the display should now be doing.
    const lyricsContextChanged = (room) => {
        if (room.currentVideo && roomService.lyricsDisplay(room)) {
            lyricsService.ensure(room.currentVideo, { durationSec: room.playback?.durationSec });
            lyricsService.recordRequest(`${room.id}:${room.currentVideo.queueId}`, room.currentVideo.id);
        }
        prefetchLyrics(room);
        broadcastLyrics(room);
    };

    // Budgets for the calls that spend the shared YouTube API quota are held
    // across connections and keyed on the registered controller. Kept in the
    // socket closure they reset on every reconnect, so a client could refresh its
    // allowance at will simply by dropping and reopening the socket.
    const quotaLimiter = new FixedWindowLimiter();

    io.on('connection', (socket) => {
        let membership = null;
        const rate = { startedAt: Date.now(), count: 0 };

        const checkRate = () => {
            const now = Date.now();
            if (now - rate.startedAt >= 60_000) { rate.startedAt = now; rate.count = 0; }
            rate.count += 1;
            if (rate.count > config.limits.maxSocketEventsPerMinute) {
                throw new AppError('socket_rate_limited', 'Too many realtime requests; please slow down', 429);
            }
        };

        const checkMutationRate = (name, limit, controllerId, message = 'Too many YouTube additions; wait before trying again') => {
            if (!quotaLimiter.consume(`${controllerId}:${name}`, limit)) {
                throw new AppError('quota_action_rate_limited', message, 429);
            }
        };

        const requireLyricsMember = (roomId) => {
            if (!membership || membership.roomId !== roomId || !LYRICS_MEMBER_ROLES.has(membership.role)) {
                throw new AppError('not_joined', 'Socket is not joined to this room', 403);
            }
            return roomService.requireRoom(roomId);
        };

        const leaveMembership = () => {
            if (!membership) return;
            socket.leave(membership.roomId);
            socket.leave(`${membership.roomId}:player-admin`);
            roomService.leaveConnection(membership.roomId, socket.id);
            membership = null;
            delete socket.data.roomMembership;
        };

        const joinMembership = (roomId, role, controllerId = null) => {
            if (membership?.roomId !== roomId || membership?.role !== role) leaveMembership();
            membership = { roomId, role, controllerId };
            socket.data.roomMembership = membership;
            socket.join(roomId);
            if (role === 'player') socket.join(`${roomId}:player-admin`);
            roomService.joinConnection(roomId, socket.id, role);
        };

        const evictController = (roomId, controllerId, code, message) => {
            for (const candidate of io.sockets.sockets.values()) {
                const joined = candidate.data.roomMembership;
                if (joined?.roomId !== roomId || joined.controllerId !== controllerId) continue;
                candidate.emit('error-message', { type: 'auth-controller', code, message });
                candidate.leave(roomId);
                candidate.leave(`${roomId}:player-admin`);
                roomService.leaveConnection(roomId, candidate.id);
                delete candidate.data.roomMembership;
            }
        };

        const on = (event, handler, { object = true } = {}) => {
            socket.on(event, async (rawPayload, ack) => {
                try {
                    checkRate();
                    const payload = object ? asObject(rawPayload) : rawPayload;
                    const result = await handler(payload);
                    if (typeof ack === 'function') ack({ ok: true, ...(result || {}) });
                } catch (error) {
                    if (!(error instanceof AppError)) logger.error(`[ERR] Socket ${event} failed: ${error.stack || error.message}`);
                    const response = errorPayload(event, error);
                    if (typeof ack === 'function') ack({ ok: false, error: response });
                    else socket.emit('error-message', response);
                }
            });
        };

        on('join-room', ({ roomId }) => {
            const room = roomService.requireRoom(roomId);
            joinMembership(room.id, 'public');
            socket.emit('room-state', roomService.publicState(room));
        });

        on('join-room-admin', ({ roomId, playerKey }) => {
            const room = roomService.requireRoom(roomId);
            roomService.validatePlayer(room, playerKey);
            joinMembership(room.id, 'player');
            socket.emit('room-state-admin', roomService.playerAdminState(room));
        });

        on('register-controller', ({ roomId, controlMasterKey, username, policyVersion }) => {
            if (policyVersion !== config.currentPrivacyPolicyVersion) {
                throw new AppError('policy_acceptance_required', 'Accept the current Privacy Policy before registering', 428);
            }
            const { controller, controllerKey } = roomService.registerController(roomId, controlMasterKey, username);
            const room = roomService.requireRoom(roomId);
            roomService.db.recordPolicyAcceptance({
                anonymousIdHash: roomService.digest(`controller:${controller.id}`),
                roomId: room.id,
                policyType: 'privacy',
                policyVersion: config.currentPrivacyPolicyVersion,
            });
            joinMembership(room.id, 'controller', controller.id);
            const response = {
                controllerKey,
                controllerId: controller.id,
                username: controller.name,
                colorHue: controller.colorHue,
                lyricsEnabled: Boolean(controller.lyricsEnabled),
            };
            socket.emit('controller-registered', response);
            socket.emit('room-state', roomService.publicState(room));
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
            return response;
        });

        on('auth-controller', ({ roomId, controllerKey }) => {
            const room = roomService.requireRoom(roomId);
            const controller = roomService.controller(room, controllerKey);
            joinMembership(room.id, 'controller', controller.id);
            const response = {
                controllerId: controller.id,
                username: controller.name,
                colorHue: controller.colorHue,
                lyricsEnabled: Boolean(controller.lyricsEnabled),
            };
            socket.emit('controller-authenticated', response);
            socket.emit('room-state', roomService.publicState(room));
            return response;
        });

        on('rename-controller', ({ roomId, controllerKey, newName }) => {
            const controller = roomService.renameController(roomId, controllerKey, newName);
            const room = roomService.requireRoom(roomId);
            socket.emit('controller-renamed', { username: controller.name });
            io.to(room.id).emit('queue-updated', room.queue);
            if (room.currentVideo) io.to(room.id).emit('video-changed', room.currentVideo);
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
            return { username: controller.name };
        });

        on('update-controller-color', ({ roomId, controllerKey, colorHue }) => {
            const controller = roomService.updateControllerColor(roomId, controllerKey, colorHue);
            const room = roomService.requireRoom(roomId);
            socket.emit('controller-color-updated', { colorHue: controller.colorHue });
            io.to(room.id).emit('queue-updated', room.queue);
            if (room.currentVideo) io.to(room.id).emit('video-changed', room.currentVideo);
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
            return { colorHue: controller.colorHue };
        });

        on('add-to-queue', async ({ roomId, video, controllerKey, addToTop }) => {
            const room = roomService.requireRoom(roomId);
            const controller = roomService.controller(room, controllerKey);
            if (!video || typeof video !== 'object') throw new AppError('invalid_video', 'Invalid video data');
            if (addToTop !== undefined && typeof addToTop !== 'boolean') throw new AppError('invalid_queue_priority', 'Queue priority must be a boolean');
            const capacity = roomService.remainingQueueCapacity(room);
            if (capacity <= 0) throw new AppError('queue_full', 'Queue is at maximum capacity', 409);
            let videos;
            if (video.isPlaylist) {
                checkMutationRate('playlist-add', config.limits.maxPlaylistAddsPerMinute, controller.id);
                videos = await youtubeService.expandPlaylist(video.id, room.id, Math.min(capacity, config.limits.maxPlaylistItemsPerAdd));
                if (videos.length === 0) throw new AppError('empty_playlist', 'No playable public videos were found in this playlist', 404);
            } else {
                checkMutationRate('video-add', config.limits.maxVideoAddsPerMinute, controller.id);
                videos = await youtubeService.lookupVideos([video.id], room.id);
                if (videos.length === 0) throw new AppError('video_unavailable', 'This video is unavailable or not public', 404);
            }
            const result = roomService.addVideos(room.id, controllerKey, videos, { priority: addToTop === true });
            if (result.currentChanged) io.to(room.id).emit('video-changed', room.currentVideo);
            io.to(room.id).emit('queue-updated', room.queue);
            if (result.currentChanged) lyricsContextChanged(room);
            else prefetchLyrics(room);
            socket.emit('queue-add-result', { addedCount: result.addedCount, skippedCount: result.skippedCount });
            return { addedCount: result.addedCount, skippedCount: result.skippedCount };
        });

        on('play-next', ({ roomId, controllerKey, expectedQueueId }) => {
            const result = roomService.advance(roomId, controllerKey, expectedQueueId, 'controller');
            const room = roomService.requireRoom(roomId);
            if (result.advanced) {
                io.to(room.id).emit('video-changed', room.currentVideo);
                io.to(room.id).emit('queue-updated', room.queue);
                io.to(room.id).emit('playback-updated', room.playback);
                lyricsContextChanged(room);
            }
            return result;
        });

        on('player-play-next', ({ roomId, playerKey, expectedQueueId }) => {
            const result = roomService.advance(roomId, playerKey, expectedQueueId, 'player');
            const room = roomService.requireRoom(roomId);
            if (result.advanced) {
                io.to(room.id).emit('video-changed', room.currentVideo);
                io.to(room.id).emit('queue-updated', room.queue);
                io.to(room.id).emit('playback-updated', room.playback);
                lyricsContextChanged(room);
            }
            return result;
        });

        on('request-room-state', ({ roomId }) => {
            if (!membership || membership.roomId !== roomId) throw new AppError('not_joined', 'Socket is not joined to this room', 403);
            const room = roomService.requireRoom(roomId);
            socket.emit(membership.role === 'player' ? 'room-state-admin' : 'room-state',
                membership.role === 'player' ? roomService.playerAdminState(room) : roomService.publicState(room));
        });

        on('remove-from-queue', ({ roomId, queueId, controllerKey }) => {
            if (queueId === undefined || queueId === null) throw new AppError('queue_item_required', 'Queue item ID is required');
            roomService.removeFromQueue(roomId, controllerKey, queueId);
            const room = roomService.requireRoom(roomId);
            io.to(room.id).emit('queue-updated', room.queue);
            prefetchLyrics(room);
        });

        on('reorder-queue', ({ roomId, orderedQueueIds, controllerKey }) => {
            const result = roomService.reorderQueue(roomId, controllerKey, orderedQueueIds);
            const room = roomService.requireRoom(roomId);
            // Always broadcast: clients apply reorders optimistically without the
            // round-robin rebuild, so even a no-op has to reconcile their view.
            io.to(room.id).emit('queue-updated', room.queue);
            if (result.changed) prefetchLyrics(room);
            return { changed: result.changed, scope: result.scope };
        });

        on('update-settings', ({ roomId, settings, controllerKey }) => {
            const updated = roomService.updateSettings(roomId, controllerKey, settings);
            const room = roomService.requireRoom(roomId);
            io.to(room.id).emit('queue-updated', room.queue);
            io.to(room.id).emit('settings-updated', updated);
            if (Object.hasOwn(settings, 'lyricsEnabled') || Object.hasOwn(settings, 'lyricsPerUser')) lyricsContextChanged(room);
            return { settings: updated };
        });

        // ── lyrics ──

        // NTP-style clock probe: the client times the round trip and assumes the
        // server read its clock halfway through it.
        on('time-sync', () => ({ serverTime: Date.now() }));

        on('lyrics-get', async ({ roomId, queueId, readingMode, includeDocument, lookup }) => {
            const room = requireLyricsMember(roomId);
            const video = room.currentVideo;
            const current = video && (queueId === undefined || queueId === null || String(queueId) === String(video.queueId));
            // Start (or resume, after a restart) the lookup for a member that
            // will show the lyrics: the room display when it shows them, or a
            // controller with its Lyrics tab open (`lookup`), even while the
            // room display has lyrics off. Members only ask for the text once
            // the lookup has found some, so the text request cannot be the trigger.
            if (current && (lookup === true || includeDocument === true || roomService.lyricsDisplay(room))) {
                lyricsService.ensure(video, { durationSec: room.playback?.durationSec });
                lyricsService.recordRequest(`${room.id}:${video.queueId}`, video.id);
            }
            if (lookup === true && membership.role === 'controller') {
                // Someone reads lyrics on a phone: have the next songs ready too.
                const wasReading = roomService.lyricsReaderActive(room);
                roomService.noteLyricsReader(room);
                if (!wasReading) prefetchLyrics(room);
            }
            const state = lyricsStateFor(room, { roomService, lyricsService });
            if (!current || includeDocument !== true || state.status !== 'ready') return { state, document: null };
            const document = await lyricsService.document(video.id, {
                source: state.source,
                readingMode: typeof readingMode === 'string' ? readingMode : 'romaji',
            });
            return { state, document };
        });

        // What the current song's lyrics matched, for checking they belong to
        // the right recording.
        on('lyrics-match', ({ roomId, queueId }) => {
            const room = requireLyricsMember(roomId);
            const video = room.currentVideo;
            if (!video || (queueId !== undefined && queueId !== null && String(queueId) !== String(video.queueId))) return { details: null };
            return { details: lyricsService.matchDetails(video.id) };
        });

        // A controller corrects the search for the current song. The fix is
        // shared: it applies wherever the video plays, and it is audited.
        on('lyrics-search', async ({ roomId, controllerKey, expectedQueueId, artist, track }) => {
            const room = roomService.requireRoom(roomId);
            const controller = roomService.controller(room, controllerKey);
            const video = room.currentVideo;
            if (!video) throw new AppError('nothing_playing', 'There is no current video', 409);
            if (expectedQueueId === undefined || expectedQueueId === null || String(expectedQueueId) !== String(video.queueId)) {
                throw new AppError('stale_lyrics', 'The song changed before the search ran', 409);
            }
            checkMutationRate('lyrics-search', config.limits.maxLyricsSearchesPerMinute, controller.id,
                'Too many lyrics searches; wait a minute before trying again');
            const result = await lyricsService.searchWithTerms(video, { artist, track }, { roomId: room.id, controllerId: controller.id });
            return {
                found: result.found,
                outcomes: result.outcomes,
                state: lyricsStateFor(room, { roomService, lyricsService }),
                details: lyricsService.matchDetails(video.id),
            };
        });

        on('lyrics-set', ({ roomId, controllerKey, expectedQueueId, source, offsetMs }) => {
            const room = roomService.requireRoom(roomId);
            roomService.controller(room, controllerKey);
            if (source !== undefined && source !== null && room.currentVideo) {
                const available = lyricsService.songState(room.currentVideo?.id ?? null).sources.map((entry) => entry.id);
                if (!available.includes(source)) throw new AppError('lyrics_source_unavailable', 'That lyrics source has nothing for this song', 409);
            }
            roomService.setLyricsOverride(roomId, controllerKey, { expectedQueueId, source, offsetMs });
            const state = lyricsStateFor(room, { roomService, lyricsService });
            io.to(room.id).emit('lyrics-updated', state);
            return { state };
        });

        on('update-controller-lyrics', ({ roomId, controllerKey, enabled }) => {
            const controller = roomService.setControllerLyrics(roomId, controllerKey, enabled);
            const room = roomService.requireRoom(roomId);
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
            if (room.currentVideo?.controllerId === controller.id) lyricsContextChanged(room);
            else prefetchLyrics(room);
            return { lyricsEnabled: controller.lyricsEnabled };
        });

        on('playback-state', ({ roomId, playerKey, ...update }) => {
            const playback = roomService.updatePlayback(roomId, playerKey, update);
            io.to(roomId).emit('playback-updated', playback);
        });

        on('control-playback', ({ roomId, controllerKey, command }) => {
            const result = roomService.controlPlayback(roomId, controllerKey, command);
            io.to(`${roomId}:player-admin`).emit('player-command', result.playerCommand);
            io.to(roomId).emit('playback-updated', result.playback);
            return { playback: result.playback };
        });

        on('admin-toggle-controller', ({ roomId, playerKey, controllerId, enabled }) => {
            if (!isIdentifier(controllerId, 128) || typeof enabled !== 'boolean') throw new AppError('invalid_controller_update', 'Invalid controller update');
            roomService.toggleController(roomId, playerKey, controllerId, enabled);
            const room = roomService.requireRoom(roomId);
            if (!enabled) evictController(room.id, controllerId, 'controller_disabled', 'This controller has been disabled');
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
        });

        on('admin-remove-controller', ({ roomId, playerKey, controllerId }) => {
            if (!isIdentifier(controllerId, 128)) throw new AppError('invalid_controller_update', 'Invalid controller ID');
            roomService.removeController(roomId, playerKey, controllerId);
            const room = roomService.requireRoom(roomId);
            evictController(room.id, controllerId, 'controller_removed', 'This controller has been removed');
            io.to(`${room.id}:player-admin`).emit('controllers-updated', roomService.playerAdminState(room).controllers);
            // In per-singer mode a removed controller's song stops showing lyrics.
            if (room.currentVideo?.controllerId === controllerId) broadcastLyrics(room);
        });

        on('admin-toggle-registration', ({ roomId, playerKey, allow }) => {
            if (typeof allow !== 'boolean') throw new AppError('invalid_registration_update', 'Invalid registration setting');
            const allowed = roomService.toggleRegistration(roomId, playerKey, allow);
            io.to(roomId).emit('registration-status', { allowNewControllers: allowed });
        });

        on('leave-room', (payload) => {
            const roomId = typeof payload === 'string' ? payload : asObject(payload).roomId;
            if (membership?.roomId === roomId) leaveMembership();
        }, { object: false });

        socket.on('disconnect', leaveMembership);
        socket.on('error', (error) => logger.warn(`[WARN] Socket ${socket.id} error: ${error.message}`));
    });
}

module.exports = { errorPayload, lyricsStateFor, registerSocketHandlers };

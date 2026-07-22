const { AppError, asObject, isIdentifier } = require('./security');

function errorPayload(event, error) {
    return {
        type: event,
        code: error instanceof AppError ? error.code : 'internal_error',
        message: error instanceof AppError ? error.message : 'The request could not be completed',
    };
}

function registerSocketHandlers(io, { roomService, youtubeService, config, logger = console }) {
    io.on('connection', (socket) => {
        let membership = null;
        const rate = { startedAt: Date.now(), count: 0 };
        const mutationRates = new Map();

        const checkRate = () => {
            const now = Date.now();
            if (now - rate.startedAt >= 60_000) { rate.startedAt = now; rate.count = 0; }
            rate.count += 1;
            if (rate.count > config.limits.maxSocketEventsPerMinute) {
                throw new AppError('socket_rate_limited', 'Too many realtime requests; please slow down', 429);
            }
        };

        const checkMutationRate = (name, limit) => {
            const now = Date.now();
            const bucket = mutationRates.get(name) || { startedAt: now, count: 0 };
            if (now - bucket.startedAt >= 60_000) { bucket.startedAt = now; bucket.count = 0; }
            bucket.count += 1;
            mutationRates.set(name, bucket);
            if (bucket.count > limit) throw new AppError('quota_action_rate_limited', 'Too many YouTube additions; wait before trying again', 429);
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
            roomService.controller(room, controllerKey);
            if (!video || typeof video !== 'object') throw new AppError('invalid_video', 'Invalid video data');
            if (addToTop !== undefined && typeof addToTop !== 'boolean') throw new AppError('invalid_queue_priority', 'Queue priority must be a boolean');
            const capacity = roomService.remainingQueueCapacity(room);
            if (capacity <= 0) throw new AppError('queue_full', 'Queue is at maximum capacity', 409);
            let videos;
            if (video.isPlaylist) {
                checkMutationRate('playlist-add', config.limits.maxPlaylistAddsPerMinute);
                videos = await youtubeService.expandPlaylist(video.id, room.id, Math.min(capacity, config.limits.maxPlaylistItemsPerAdd));
                if (videos.length === 0) throw new AppError('empty_playlist', 'No playable public videos were found in this playlist', 404);
            } else {
                checkMutationRate('video-add', config.limits.maxVideoAddsPerMinute);
                videos = await youtubeService.lookupVideos([video.id], room.id);
                if (videos.length === 0) throw new AppError('video_unavailable', 'This video is unavailable or not public', 404);
            }
            const result = roomService.addVideos(room.id, controllerKey, videos, { priority: addToTop === true });
            if (result.currentChanged) io.to(room.id).emit('video-changed', room.currentVideo);
            io.to(room.id).emit('queue-updated', room.queue);
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
        });

        on('reorder-queue', ({ roomId, orderedQueueIds, controllerKey }) => {
            const result = roomService.reorderQueue(roomId, controllerKey, orderedQueueIds);
            const room = roomService.requireRoom(roomId);
            if (result.changed) io.to(room.id).emit('queue-updated', room.queue);
            return { changed: result.changed, scope: result.scope };
        });

        on('update-settings', ({ roomId, settings, controllerKey }) => {
            const updated = roomService.updateSettings(roomId, controllerKey, settings);
            const room = roomService.requireRoom(roomId);
            io.to(room.id).emit('queue-updated', room.queue);
            io.to(room.id).emit('settings-updated', updated);
        });

        on('playback-state', ({ roomId, playerKey, ...update }) => {
            const playback = roomService.updatePlayback(roomId, playerKey, update);
            io.to(roomId).emit('playback-updated', playback);
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

module.exports = { errorPayload, registerSocketHandlers };

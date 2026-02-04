require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load configuration
let config;
try {
    // Try to load from client/src first
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'client/src/ytkt-config.json'), 'utf8'));
} catch (error) {
    // Fallback to root directory
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'ytkt-config.json'), 'utf8'));
}

// Log environment variables (excluding sensitive data)
console.log('[INFO] Environment loaded:', {
    PORT: process.env.PORT,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? 'Configured' : 'Not configured'
});

console.log('[INFO] Configuration loaded:', config);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: `${config.frontend.ssl ? 'https' : 'http'}://${config.frontend.hostname}:${config.frontend.port}`,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const logLevel = status >= 400 ? 'ERR' : 'INFO';
        console.log(`[${logLevel}] ${req.method} '${req.originalUrl}' - ${status} (${duration}ms)`);
    });
    next();
});

app.use(cors());
app.use(express.json());

// Store active rooms and their queues
const rooms = new Map();

// ----- Room helpers -----
function createEmptyRoom() {
    return {
        queue: [],
        currentVideo: null,
        // User-configurable settings per room
        settings: {
            roundRobinEnabled: false,
        },
        // Internal state for round-robin ordering
        roundRobin: {
            participants: [], // ordered list of usernames
            lastServedIdx: -1, // index into participants of who last played
        },
        // Live playback state snapshot reported by the room's player
        playback: {
            state: 'unstarted', // 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'cued'
            positionSec: 0,
            durationSec: null,
            updatedAt: Date.now(),
            videoId: null,
        },
        createdAt: Date.now(),
    };
}

function ensureRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, createEmptyRoom());
    }
    return rooms.get(roomId);
}

function getPublicRoomState(room) {
    // Only expose fields needed by clients
    return {
        queue: room.queue,
        currentVideo: room.currentVideo,
        settings: room.settings,
        playback: room.playback,
        createdAt: room.createdAt,
    };
}

function indexOfParticipant(room, username) {
    return room.roundRobin.participants.findIndex((u) => u === username);
}

function upsertParticipant(room, username) {
    if (!username) return; // ignore anonymous
    const idx = indexOfParticipant(room, username);
    if (idx === -1) {
        room.roundRobin.participants.push(username);
    }
}

// We intentionally avoid pruning participants to preserve join order priority.
// Participants remain in the list; we will simply skip users with no items.
function pruneParticipants(_) { /* no-op to preserve join order */ }

function reorderQueueRoundRobin(room) {
    if (!room.settings.roundRobinEnabled) return; // nothing to do
    if (room.queue.length === 0) return;

    // Build per-user queues preserving insertion order
    const userToItems = new Map();
    for (const item of room.queue) {
        const key = item.addedBy || 'Unknown';
        if (!userToItems.has(key)) userToItems.set(key, []);
        userToItems.get(key).push(item);
        // Ensure participant exists and preserve join order priority
        upsertParticipant(room, key);
    }

    const participantsSnapshot = room.roundRobin.participants.slice();
    const totalParticipants = participantsSnapshot.length;
    if (totalParticipants <= 1) return;

    const newQueue = [];
    let remaining = room.queue.length;
    const n = totalParticipants;
    let cursor = room.roundRobin.lastServedIdx; // the last who sang; next search starts after this index

    let safetyCounter = remaining + n + 100;
    while (remaining > 0 && safetyCounter-- > 0) {
        // find next participant with available items scanning in join order priority
        let nextIdx = -1;
        for (let step = 1; step <= n; step++) {
            const idx = (cursor + step) % n;
            const user = participantsSnapshot[idx];
            const items = userToItems.get(user);
            if (items && items.length > 0) {
                nextIdx = idx;
                break;
            }
        }

        if (nextIdx === -1) break; // no more items anywhere

        const nextUser = participantsSnapshot[nextIdx];
        const list = userToItems.get(nextUser);
        newQueue.push(list.shift());
        remaining--;
        cursor = nextIdx; // serve nextUser and advance pivot
    }

    // Append any leftovers in join order, then any users not in participants (should not happen)
    for (const user of participantsSnapshot) {
        const items = userToItems.get(user) || [];
        while (items.length > 0) newQueue.push(items.shift());
        userToItems.delete(user);
    }
    for (const [, items] of userToItems.entries()) {
        while (items.length > 0) newQueue.push(items.shift());
    }

    room.queue = newQueue;
}

function setCurrentVideo(room, video) {
    room.currentVideo = video;
    // Update playback videoId immediately
    room.playback.videoId = video ? video.id : null;
    room.playback.positionSec = 0;
    room.playback.updatedAt = Date.now();
    if (video && video.addedBy) {
        upsertParticipant(room, video.addedBy);
        // Consider the current singer as the last served for round-robin fairness
        const idx = indexOfParticipant(room, video.addedBy);
        if (idx !== -1) {
            room.roundRobin.lastServedIdx = idx;
        }
    }
}

// Cleanup old rooms every hour
setInterval(() => {
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (const [roomId, room] of rooms.entries()) {
        if (now - room.createdAt > ONE_DAY_MS) {
            console.log(`[INFO] Cleaning up old room: ${roomId}`);
            rooms.delete(roomId);
        }
    }
}, 60 * 60 * 1000); // Run every hour

// Generate QR code for a room
async function generateRoomQR(roomId, origin) {
    const frontendUrl = origin ? origin : `${config.frontend.ssl ? 'https' : 'http'}://${config.frontend.hostname}:${config.frontend.port}`;
    const url = `${frontendUrl}/control/${roomId}`;
    return await QRCode.toDataURL(url);
}

// Create a new room
app.post('/api/rooms', async (req, res) => {
    try {
        const roomId = uuidv4();
        rooms.set(roomId, createEmptyRoom());

        const qrCode = await generateRoomQR(roomId, req.headers.hostname);
        console.log(`[INFO] Created new room: ${roomId}`);
        res.json({ roomId, qrCode });
    } catch (error) {
        console.error(`[ERR] Failed to create room: ${error.message}`);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// Get QR code for a room
app.get('/api/rooms/:roomId/qr', async (req, res) => {
    const origin = req.headers.hostname;
    console.log('[INFO] QR Origin:', origin);
    try {
        const { roomId } = req.params;
        ensureRoom(roomId);
        console.log(`[INFO] Generating QR code for room ${roomId}`);
        const qrCode = await generateRoomQR(roomId, origin);
        res.json({ qrCode });
    } catch (error) {
        console.error(`[ERR] Failed to generate QR code: ${error.message}`);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Get room status
app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    // Ensure room exists
    ensureRoom(roomId);
    const room = rooms.get(roomId);
    console.log(`[INFO] Retrieved room status: ${roomId}`);
    res.json(getPublicRoomState(room));
});

// Search YouTube videos
app.get('/api/search', async (req, res) => {
    const { query, pageToken } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        console.log('[ERR] YouTube API key not configured');
        return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    try {
        console.log(`[INFO] Searching YouTube for: "${query}"${pageToken ? ` with pageToken: ${pageToken}` : ''}`);
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/search`,
            {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video,playlist',
                    key: apiKey,
                    maxResults: 10,
                    safeSearch: 'none',
                    pageToken: pageToken || undefined
                }
            }
        );

        // Filter and process the results
        const processedItems = response.data.items
            .filter(item => item.id.kind === 'youtube#video' || item.id.kind === 'youtube#playlist')
            .map(item => ({
                ...item,
                isPlaylist: item.id.kind === 'youtube#playlist'
            }));

        console.log(`[INFO] Found ${processedItems.length} results for: "${query}"`);
        res.json({
            ...response.data,
            items: processedItems,
            nextPageToken: response.data.nextPageToken,
            prevPageToken: response.data.prevPageToken
        });
    } catch (error) {
        console.error(`[ERR] YouTube search failed: ${error.message}`);
        res.status(500).json({ error: 'Error searching YouTube videos' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`[INFO] New socket connection: ${socket.id}`);
    let currentRoom = null;

    socket.on('join-room', (payload) => {
        const { roomId, username } = typeof payload === 'string' ? { roomId: payload } : (payload || {});
        console.log(`[INFO] Socket ${socket.id} attempting to join room: ${roomId} as ${username || 'anonymous'}`);

        try {
            if (!roomId || typeof roomId !== 'string') {
                const error = 'Invalid room ID provided';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'join-room', message: error });
                return;
            }

            currentRoom = roomId;
            socket.join(roomId);
            console.log(`[INFO] Socket ${socket.id} joined room: ${roomId}`);

            const room = ensureRoom(roomId);
            if (username && typeof username === 'string') {
                upsertParticipant(room, username);
            }
            console.log(`[INFO] Sending room state to socket ${socket.id}:`, getPublicRoomState(room));
            socket.emit('room-state', getPublicRoomState(room));
        } catch (error) {
            console.log(`[ERR] Failed to join room ${roomId} for socket ${socket.id}:`, error.message);
            socket.emit('error-message', { type: 'join-room', message: 'Failed to join room' });
        }
    });

    // Optional: allow updating username to track RR participants without rejoining
    socket.on('identify', ({ roomId, username }) => {
        try {
            if (!roomId || typeof roomId !== 'string') return;
            const room = rooms.get(roomId);
            if (!room) return;
            if (username && typeof username === 'string') {
                upsertParticipant(room, username);
            }
        } catch (_) { }
    });

    socket.on('add-to-queue', ({ roomId, video }) => {
        console.log(`[INFO] Received add-to-queue event from socket ${socket.id} for room ${roomId}:`, video);

        try {
            if (!roomId || !video) {
                const error = 'Missing room ID or video data';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'add-to-queue', message: error });
                return;
            }

            if (!video.id || !video.title) {
                const error = 'Invalid video data provided';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'add-to-queue', message: error });
                return;
            }

            const room = rooms.get(roomId);
            if (room) {
                // If this is the first video and no video is currently playing, set it as current
                if (room.queue.length === 0 && !room.currentVideo) {
                    console.log(`[INFO] Setting first video as current: ${video.title}`);
                    setCurrentVideo(room, video);
                    io.to(roomId).emit('video-changed', room.currentVideo);
                } else {
                    room.queue.push(video);
                    // Maintain RR ordering if enabled
                    reorderQueueRoundRobin(room);
                    console.log(`[INFO] Added video "${video.title}" to queue`);
                }
                console.log(`[INFO] Current queue length: ${room.queue.length}`);
                io.to(roomId).emit('queue-updated', room.queue);
            } else {
                const error = `Room ${roomId} not found`;
                console.log(`[ERR] ${error} when adding video from socket ${socket.id}`);
                socket.emit('error-message', { type: 'add-to-queue', message: error });
            }
        } catch (error) {
            console.log(`[ERR] Failed to add video to queue for socket ${socket.id}:`, error.message);
            socket.emit('error-message', { type: 'add-to-queue', message: 'Failed to add video to queue' });
        }
    });

    socket.on('play-next', (roomId) => {
        console.log(`[INFO] Received play-next event from socket ${socket.id} for room ${roomId}`);

        try {
            if (!roomId || typeof roomId !== 'string') {
                const error = 'Invalid room ID provided';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'play-next', message: error });
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                const error = `Room ${roomId} not found`;
                console.log(`[ERR] ${error} when playing next from socket ${socket.id}`);
                socket.emit('error-message', { type: 'play-next', message: error });
                return;
            }

            if (room.queue.length > 0) {
                const nextVideo = room.queue.shift();
                setCurrentVideo(room, nextVideo);
                console.log(`[INFO] Playing next video "${room.currentVideo.title}" in room ${roomId}`);
                io.to(roomId).emit('video-changed', room.currentVideo);
                io.to(roomId).emit('queue-updated', room.queue);

                // Update round-robin lastServedIdx to the user who just played, if enabled
                if (room.settings.roundRobinEnabled && room.currentVideo && room.currentVideo.addedBy) {
                    const idx = indexOfParticipant(room, room.currentVideo.addedBy);
                    if (idx !== -1) {
                        room.roundRobin.lastServedIdx = idx;
                    }
                }
            } else {
                console.log(`[INFO] No videos in queue for room ${roomId}`);
                if (room.currentVideo) {
                    setCurrentVideo(room, null);
                    io.to(roomId).emit('video-changed', null);
                }
                io.to(roomId).emit('queue-updated', []);
            }
        } catch (error) {
            console.log(`[ERR] Failed to play next video for socket ${socket.id}:`, error.message);
            socket.emit('error-message', { type: 'play-next', message: 'Failed to skip to next video' });
        }
    });

    socket.on('remove-from-queue', ({ roomId, index }) => {
        console.log(`[INFO] Received remove-from-queue event from socket ${socket.id} for room ${roomId}, index: ${index}`);

        try {
            if (!roomId || typeof roomId !== 'string') {
                const error = 'Invalid room ID provided';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'remove-from-queue', message: error });
                return;
            }

            if (typeof index !== 'number' || index < 0) {
                const error = 'Invalid queue index provided';
                console.log(`[ERR] ${error} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'remove-from-queue', message: error });
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                const error = `Room ${roomId} not found`;
                console.log(`[ERR] ${error} when removing from queue from socket ${socket.id}`);
                socket.emit('error-message', { type: 'remove-from-queue', message: error });
                return;
            }

            if (room.queue.length <= index) {
                const error = `Invalid queue index ${index} (queue has ${room.queue.length} items)`;
                console.log(`[ERR] ${error} for room ${roomId} from socket ${socket.id}`);
                socket.emit('error-message', { type: 'remove-from-queue', message: 'Video not found in queue' });
                return;
            }

            const removedVideo = room.queue.splice(index, 1)[0];
            if (room.settings.roundRobinEnabled) {
                reorderQueueRoundRobin(room);
            }
            console.log(`[INFO] Removed video "${removedVideo.title}" from queue`);
            io.to(roomId).emit('queue-updated', room.queue);
        } catch (error) {
            console.log(`[ERR] Failed to remove video from queue for socket ${socket.id}:`, error.message);
            socket.emit('error-message', { type: 'remove-from-queue', message: 'Failed to remove video from queue' });
        }
    });

    // Optional room leave support
    socket.on('leave-room', (roomId) => {
        try {
            if (!roomId || typeof roomId !== 'string') return;
            socket.leave(roomId);
            if (currentRoom === roomId) currentRoom = null;
            console.log(`[INFO] Socket ${socket.id} left room: ${roomId}`);
        } catch (err) {
            console.log(`[ERR] Failed to leave room ${roomId} for socket ${socket.id}:`, err.message);
        }
    });

    // Update live playback status from Room player and broadcast to control UIs
    socket.on('playback-state', ({ roomId, state, positionSec, durationSec, videoId }) => {
        try {
            if (!roomId || typeof roomId !== 'string') return;
            const room = rooms.get(roomId);
            if (!room) return;
            if (state) room.playback.state = state;
            if (typeof positionSec === 'number') room.playback.positionSec = positionSec;
            if (typeof durationSec === 'number') room.playback.durationSec = durationSec;
            if (typeof videoId === 'string' || videoId === null) room.playback.videoId = videoId;
            room.playback.updatedAt = Date.now();
            io.to(roomId).emit('playback-updated', room.playback);
        } catch (err) {
            console.log(`[ERR] Failed to process playback-state from ${socket.id}:`, err.message);
        }
    });

    // Toggle room settings, currently only round-robin flag
    socket.on('update-settings', ({ roomId, settings }) => {
        try {
            if (!roomId || typeof roomId !== 'string') return;
            const room = rooms.get(roomId);
            if (!room) return;
            if (settings && typeof settings.roundRobinEnabled === 'boolean') {
                room.settings.roundRobinEnabled = settings.roundRobinEnabled;
                // Recompute order on toggle
                reorderQueueRoundRobin(room);
                io.to(roomId).emit('queue-updated', room.queue);
            }
            io.to(roomId).emit('settings-updated', room.settings);
        } catch (err) {
            console.log(`[ERR] Failed to update settings for room ${roomId}:`, err.message);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom) {
            console.log(`[INFO] Socket ${socket.id} disconnected from room: ${currentRoom}`);
            socket.leave(currentRoom);
        }
    });

    socket.on('error', (error) => {
        console.error(`[ERR] Socket ${socket.id} error:`, error);
    });
});

const PORT = Number(process.env.PORT) || config.backend.port;
server.listen(PORT, () => {
    console.log(`[INFO] Server running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const QRCode = require('qrcode');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// ----- Configuration -----
const PORT = Number(process.env.PORT) || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_FRONTEND_ORIGIN = process.env.PUBLIC_FRONTEND_ORIGIN || 'http://localhost:3000';
const LIMITS_CONFIG_PATH = process.env.LIMITS_CONFIG_PATH || path.join(__dirname, 'server-limits.json');

const DEFAULT_LIMITS = {
    maxRooms: 5000,
    maxControllersPerRoom: 500,
    maxQueueLengthPerRoom: 1000,
    maxUsernameLength: 50,
    maxVideoTitleLength: 200,
    maxVideoIdLength: 64,
    maxSearchQueryLength: 200,
    maxHttpBufferSize: 64 * 1024,
};

const MAX_TOKEN_GENERATION_ATTEMPTS = 5;
const MAX_ROOM_ID_GENERATION_ATTEMPTS = 5;

function loadLimitsConfig() {
    const limits = { ...DEFAULT_LIMITS };
    try {
        if (!fs.existsSync(LIMITS_CONFIG_PATH)) {
            console.log(`[WARN] Limits config not found at ${LIMITS_CONFIG_PATH}, using defaults.`);
            return limits;
        }
        const raw = fs.readFileSync(LIMITS_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [key, value] of Object.entries(DEFAULT_LIMITS)) {
            if (typeof parsed[key] === 'number' && Number.isFinite(parsed[key]) && parsed[key] > 0) {
                limits[key] = parsed[key];
            }
        }
    } catch (error) {
        console.log(`[WARN] Failed to load limits config: ${error.message}. Using defaults.`);
    }
    return limits;
}

const LIMITS = loadLimitsConfig();

// Log environment variables (excluding sensitive data)
console.log('[INFO] Environment loaded:', {
    PORT,
    NODE_ENV,
    PUBLIC_FRONTEND_ORIGIN,
    LIMITS_CONFIG_PATH,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? 'Configured' : 'Not configured'
});

console.log('[INFO] Limits loaded:', LIMITS);

const app = express();
const server = http.createServer(app);

// Trust nginx proxy for client IPs (rate limiting)
app.set('trust proxy', 'loopback');

// ----- CORS Configuration -----
const allowedOrigins = [PUBLIC_FRONTEND_ORIGIN];
if (NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173');
}

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/:\d+$/, '')))) {
            callback(null, true);
        } else {
            console.log(`[WARN] CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));

// Socket.IO with restricted CORS and /ws/ path for production
const io = socketIo(server, {
    path: NODE_ENV === 'production' ? '/ws/' : '/socket.io/',
    maxHttpBufferSize: LIMITS.maxHttpBufferSize,
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// ----- Rate Limiting -----
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: { error: 'Too many search requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const roomCreateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10, // 10 room creations per minute per IP
    message: { error: 'Too many room creations, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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

app.use(express.json({ limit: '100kb' }));

// ----- Utility Functions -----
function generateSecureToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateRandomHue() {
    return Math.floor(Math.random() * 360);
}

function validateUsername(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Invalid username provided' };
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Username cannot be empty' };
    }
    if (trimmed.includes('[') || trimmed.includes(']')) {
        return { valid: false, error: 'Invalid username. Please remove [ or ] characters.' };
    }
    if (trimmed.length > LIMITS.maxUsernameLength) {
        return { valid: false, error: `Username must be ${LIMITS.maxUsernameLength} characters or less.` };
    }
    return { valid: true, name: trimmed };
}

function makeUniqueUsername(room, baseName, excludeControllerKey = null) {
    const existingNames = new Set(
        Array.from(room.controllers.entries())
            .filter(([key]) => key !== excludeControllerKey)
            .map(([, controller]) => controller.name)
    );
    if (!existingNames.has(baseName)) {
        return baseName;
    }
    let counter = 2;
    while (existingNames.has(`${baseName} [${counter}]`)) {
        counter++;
    }
    return `${baseName} [${counter}]`;
}

function renameParticipant(room, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    const idx = room.roundRobin.participants.findIndex((u) => u === oldName);
    if (idx !== -1) {
        room.roundRobin.participants[idx] = newName;
    }

    for (const item of room.queue) {
        if (item.addedBy === oldName) {
            item.addedBy = newName;
        }
    }

    if (room.currentVideo && room.currentVideo.addedBy === oldName) {
        room.currentVideo.addedBy = newName;
    }
}

// ----- Room State -----
const rooms = new Map();

function generateUniqueValue(generator, isCollision, maxAttempts, label) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const value = generator();
        if (!isCollision(value)) {
            return value;
        }
        console.log(`[WARN] ${label} collision detected on attempt ${attempt}; retrying.`);
    }
    throw new Error(`Unable to generate unique ${label} after ${maxAttempts} attempts`);
}

function isAuthTokenInUse(token) {
    for (const room of rooms.values()) {
        if (room.controlMasterKey === token || room.playerKey === token || room.controllers.has(token)) {
            return true;
        }
    }
    return false;
}

function generateUniqueRoomId() {
    return generateUniqueValue(
        () => uuidv4(),
        (roomId) => rooms.has(roomId),
        MAX_ROOM_ID_GENERATION_ATTEMPTS,
        'room ID'
    );
}

function generateUniqueAuthToken(additionalCollisionCheck = () => false) {
    return generateUniqueValue(
        generateSecureToken,
        (token) => additionalCollisionCheck(token) || isAuthTokenInUse(token),
        MAX_TOKEN_GENERATION_ATTEMPTS,
        'auth token'
    );
}

function createEmptyRoom() {
    const controlMasterKey = generateUniqueAuthToken();
    const playerKey = generateUniqueAuthToken((token) => token === controlMasterKey);

    return {
        queue: [],
        currentVideo: null,
        settings: {
            roundRobinEnabled: false,
        },
        roundRobin: {
            participants: [],
            lastServedIdx: -1,
        },
        playback: {
            state: 'unstarted',
            positionSec: 0,
            durationSec: null,
            updatedAt: Date.now(),
            videoId: null,
        },
        createdAt: Date.now(),
        // Auth keys
        controlMasterKey,
        playerKey,
        // Controller management
        controllers: new Map(), // controllerKey -> { name, enabled, createdAt }
        allowNewControllers: true,
        // Auto-incrementing ID for queue items (used for animation keys)
        nextQueueId: 1,
    };
}

function ensureRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, createEmptyRoom());
    }
    return rooms.get(roomId);
}

function getPublicRoomState(room) {
    return {
        queue: room.queue,
        currentVideo: room.currentVideo,
        settings: room.settings,
        playback: room.playback,
        createdAt: room.createdAt,
        allowNewControllers: room.allowNewControllers,
    };
}

function getAdminRoomState(room) {
    // Include controller list for admin
    const controllers = [];
    for (const [key, data] of room.controllers.entries()) {
        controllers.push({
            id: key.substring(0, 8), // Partial key for identification
            name: data.name,
            enabled: data.enabled,
            createdAt: data.createdAt,
            colorHue: data.colorHue,
        });
    }
    return {
        ...getPublicRoomState(room),
        controllers,
    };
}

// ----- Auth Helpers -----
function validateControllerKey(room, controllerKey) {
    if (!controllerKey || !room.controllers.has(controllerKey)) {
        return { valid: false, error: 'Invalid controller key' };
    }
    const controller = room.controllers.get(controllerKey);
    if (!controller.enabled) {
        return { valid: false, error: 'Controller has been disabled' };
    }
    return { valid: true, controller };
}

function validatePlayerKey(room, playerKey) {
    if (!playerKey || playerKey !== room.playerKey) {
        return { valid: false, error: 'Invalid player key' };
    }
    return { valid: true };
}

function validateControlMasterKey(room, masterKey) {
    if (!masterKey || masterKey !== room.controlMasterKey) {
        return { valid: false, error: 'Invalid control master key' };
    }
    return { valid: true };
}

// ----- Round Robin Helpers -----
function indexOfParticipant(room, username) {
    return room.roundRobin.participants.findIndex((u) => u === username);
}

function upsertParticipant(room, username) {
    if (!username) return;
    const idx = indexOfParticipant(room, username);
    if (idx === -1) {
        room.roundRobin.participants.push(username);
    }
}

function reorderQueueRoundRobin(room) {
    if (!room.settings.roundRobinEnabled) return;
    if (room.queue.length === 0) return;

    const userToItems = new Map();
    for (const item of room.queue) {
        const key = item.addedBy || 'Unknown';
        if (!userToItems.has(key)) userToItems.set(key, []);
        userToItems.get(key).push(item);
        upsertParticipant(room, key);
    }

    const participantsSnapshot = room.roundRobin.participants.slice();
    const totalParticipants = participantsSnapshot.length;
    if (totalParticipants <= 1) return;

    const newQueue = [];
    let remaining = room.queue.length;
    const n = totalParticipants;
    let cursor = room.roundRobin.lastServedIdx;

    let safetyCounter = remaining + n + 100;
    while (remaining > 0 && safetyCounter-- > 0) {
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

        if (nextIdx === -1) break;

        const nextUser = participantsSnapshot[nextIdx];
        const list = userToItems.get(nextUser);
        newQueue.push(list.shift());
        remaining--;
        cursor = nextIdx;
    }

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
    room.playback.videoId = video ? video.id : null;
    room.playback.positionSec = 0;
    room.playback.updatedAt = Date.now();
    if (video && video.addedBy) {
        upsertParticipant(room, video.addedBy);
        const idx = indexOfParticipant(room, video.addedBy);
        if (idx !== -1) {
            room.roundRobin.lastServedIdx = idx;
        }
    }
}

// ----- Cleanup -----
setInterval(() => {
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (const [roomId, room] of rooms.entries()) {
        if (now - room.createdAt > ONE_DAY_MS) {
            console.log(`[INFO] Cleaning up old room: ${roomId}`);
            rooms.delete(roomId);
        }
    }
}, 60 * 60 * 1000);

// ----- QR Code Generation -----
function buildControlUrl(roomId, controlMasterKey) {
    return `${PUBLIC_FRONTEND_ORIGIN}/control/${roomId}?token=${encodeURIComponent(controlMasterKey)}`;
}

async function generateRoomQR(roomId, controlMasterKey) {
    const url = buildControlUrl(roomId, controlMasterKey);
    return await QRCode.toDataURL(url);
}

// ----- REST API Endpoints -----

// Create a new room
app.post('/api/rooms', roomCreateLimiter, async (req, res) => {
    try {
        if (rooms.size >= LIMITS.maxRooms) {
            return res.status(503).json({ error: 'Room limit reached. Please try again later.' });
        }
        const roomId = generateUniqueRoomId();
        const room = createEmptyRoom();
        rooms.set(roomId, room);

        const qrCode = await generateRoomQR(roomId, room.controlMasterKey);
        console.log(`[INFO] Created new room: ${roomId}`);
        
        res.json({
            roomId,
            playerKey: room.playerKey,
            controlMasterKey: room.controlMasterKey,
            qrCode
        });
    } catch (error) {
        console.error(`[ERR] Failed to create room: ${error.message}`);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// Get QR code for a room (requires playerKey for admin)
app.get('/api/rooms/:roomId/qr', async (req, res) => {
    try {
        const { roomId } = req.params;
        const playerKey = req.headers.authorization?.replace('Bearer ', '');
        
        const room = rooms.get(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const auth = validatePlayerKey(room, playerKey);
        if (!auth.valid) {
            return res.status(401).json({ error: auth.error });
        }

        const qrCode = await generateRoomQR(roomId, room.controlMasterKey);
        const controlUrl = buildControlUrl(roomId, room.controlMasterKey);
        res.json({ qrCode, controlUrl });
    } catch (error) {
        console.error(`[ERR] Failed to generate QR code: ${error.message}`);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Get room status (public, no auth required for basic state)
app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    console.log(`[INFO] Retrieved room status: ${roomId}`);
    res.json(getPublicRoomState(room));
});

// Search YouTube videos (requires auth)
app.get('/api/search', searchLimiter, async (req, res) => {
    const { query, pageToken } = req.query;
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        console.log('[ERR] YouTube API key not configured');
        return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    // Validate auth - must be a valid controllerKey or controlMasterKey
    let authorized = false;
    for (const [, room] of rooms.entries()) {
        if (room.controlMasterKey === authHeader) {
            authorized = true;
            break;
        }
        if (room.controllers.has(authHeader)) {
            const controller = room.controllers.get(authHeader);
            if (controller.enabled) {
                authorized = true;
                break;
            }
        }
    }

    if (!authorized) {
        return res.status(401).json({ error: 'Unauthorized - valid controller key required' });
    }

    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (!normalizedQuery) {
        return res.status(400).json({ error: 'Search query is required' });
    }
    if (normalizedQuery.length > LIMITS.maxSearchQueryLength) {
        return res.status(400).json({ error: `Search query must be ${LIMITS.maxSearchQueryLength} characters or less` });
    }

    try {
        console.log(`[INFO] Searching YouTube for: "${normalizedQuery}"${pageToken ? ` with pageToken: ${pageToken}` : ''}`);
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/search`,
            {
                params: {
                    part: 'snippet',
                    q: normalizedQuery,
                    type: 'video,playlist',
                    key: apiKey,
                    maxResults: 10,
                    safeSearch: 'none',
                    pageToken: pageToken || undefined
                }
            }
        );

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

// ----- Socket.IO Connection Handling -----
io.on('connection', (socket) => {
    console.log(`[INFO] New socket connection: ${socket.id}`);
    let currentRoom = null;
    let currentControllerKey = null;

    // Join room (public, no auth required to view)
    socket.on('join-room', (payload) => {
        const { roomId } = typeof payload === 'string' ? { roomId: payload } : (payload || {});
        console.log(`[INFO] Socket ${socket.id} attempting to join room: ${roomId}`);

        try {
            if (!roomId || typeof roomId !== 'string') {
                socket.emit('error-message', { type: 'join-room', message: 'Invalid room ID provided' });
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'join-room', message: 'Room not found' });
                return;
            }

            currentRoom = roomId;
            socket.join(roomId);
            console.log(`[INFO] Socket ${socket.id} joined room: ${roomId}`);
            socket.emit('room-state', getPublicRoomState(room));
        } catch (error) {
            console.log(`[ERR] Failed to join room ${roomId} for socket ${socket.id}:`, error.message);
            socket.emit('error-message', { type: 'join-room', message: 'Failed to join room' });
        }
    });

    // Join room as admin (with playerKey)
    socket.on('join-room-admin', ({ roomId, playerKey }) => {
        console.log(`[INFO] Socket ${socket.id} attempting admin join for room: ${roomId}`);

        try {
            if (!roomId || typeof roomId !== 'string') {
                socket.emit('error-message', { type: 'join-room-admin', message: 'Invalid room ID provided' });
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'join-room-admin', message: 'Room not found' });
                return;
            }

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'join-room-admin', message: auth.error });
                return;
            }

            currentRoom = roomId;
            socket.join(roomId);
            socket.join(`${roomId}:admin`); // Special admin room for admin-only events
            console.log(`[INFO] Socket ${socket.id} joined room as admin: ${roomId}`);
            socket.emit('room-state-admin', getAdminRoomState(room));
        } catch (error) {
            console.log(`[ERR] Failed admin join for room ${roomId}:`, error.message);
            socket.emit('error-message', { type: 'join-room-admin', message: 'Failed to join room as admin' });
        }
    });

    // Register a new controller (requires controlMasterKey)
    socket.on('register-controller', ({ roomId, controlMasterKey, username }) => {
        console.log(`[INFO] Socket ${socket.id} attempting to register controller for room: ${roomId}`);

        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'register-controller', message: 'Room not found' });
                return;
            }

            const auth = validateControlMasterKey(room, controlMasterKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'register-controller', message: auth.error });
                return;
            }

            if (!room.allowNewControllers) {
                socket.emit('error-message', { type: 'register-controller', message: 'New controller registration is disabled for this room' });
                return;
            }

            if (room.controllers.size >= LIMITS.maxControllersPerRoom) {
                socket.emit('error-message', { type: 'register-controller', message: 'Room is at maximum controller capacity' });
                return;
            }

            // Validate and sanitize username
            const validation = validateUsername(username);
            if (!validation.valid) {
                socket.emit('error-message', { type: 'register-controller', message: validation.error });
                return;
            }

            // Make unique name
            const uniqueName = makeUniqueUsername(room, validation.name);

            // Generate controller key and assign a random color hue
            const controllerKey = generateUniqueAuthToken();
            const colorHue = generateRandomHue();
            room.controllers.set(controllerKey, {
                name: uniqueName,
                enabled: true,
                createdAt: Date.now(),
                colorHue,
            });

            currentControllerKey = controllerKey;
            currentRoom = roomId;
            socket.join(roomId);

            // Add to round-robin participants
            upsertParticipant(room, uniqueName);

            console.log(`[INFO] Registered controller "${uniqueName}" for room ${roomId}`);
            socket.emit('controller-registered', { controllerKey, username: uniqueName, colorHue });
            // Send current room state to the newly registered controller
            socket.emit('room-state', getPublicRoomState(room));

            // Notify admin of new controller
            io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
        } catch (error) {
            console.log(`[ERR] Failed to register controller:`, error.message);
            socket.emit('error-message', { type: 'register-controller', message: 'Failed to register controller' });
        }
    });

    // Authenticate with existing controller key
    socket.on('auth-controller', ({ roomId, controllerKey }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'auth-controller', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'auth-controller', message: auth.error });
                return;
            }

            currentControllerKey = controllerKey;
            currentRoom = roomId;
            socket.join(roomId);

            console.log(`[INFO] Controller "${auth.controller.name}" authenticated for room ${roomId}`);
            socket.emit('controller-authenticated', { username: auth.controller.name, colorHue: auth.controller.colorHue });
            socket.emit('room-state', getPublicRoomState(room));
        } catch (error) {
            console.log(`[ERR] Failed to authenticate controller:`, error.message);
            socket.emit('error-message', { type: 'auth-controller', message: 'Authentication failed' });
        }
    });

    // Rename controller (requires controllerKey)
    socket.on('rename-controller', ({ roomId, controllerKey, newName }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'rename-controller', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'rename-controller', message: auth.error });
                return;
            }

            const validation = validateUsername(newName);
            if (!validation.valid) {
                socket.emit('error-message', { type: 'rename-controller', message: validation.error });
                return;
            }

            const currentName = auth.controller.name;
            const uniqueName = makeUniqueUsername(room, validation.name, controllerKey);

            if (currentName !== uniqueName) {
                auth.controller.name = uniqueName;
                renameParticipant(room, currentName, uniqueName);

                io.to(roomId).emit('queue-updated', room.queue);
                if (room.currentVideo) {
                    io.to(roomId).emit('video-changed', room.currentVideo);
                }
                io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
            }

            socket.emit('controller-renamed', { username: uniqueName });
        } catch (error) {
            console.log(`[ERR] Failed to rename controller:`, error.message);
            socket.emit('error-message', { type: 'rename-controller', message: 'Failed to rename controller' });
        }
    });

    // Update controller color (requires controllerKey)
    socket.on('update-controller-color', ({ roomId, controllerKey, colorHue }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'update-controller-color', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'update-controller-color', message: auth.error });
                return;
            }

            if (typeof colorHue !== 'number' || !Number.isFinite(colorHue) || colorHue < 0 || colorHue >= 360) {
                socket.emit('error-message', { type: 'update-controller-color', message: 'Invalid color hue (must be 0-359)' });
                return;
            }

            const newHue = Math.floor(colorHue);
            auth.controller.colorHue = newHue;

            // Update all queue items and currentVideo from this controller
            const controllerName = auth.controller.name;
            for (const item of room.queue) {
                if (item.addedBy === controllerName) {
                    item.colorHue = newHue;
                }
            }
            if (room.currentVideo && room.currentVideo.addedBy === controllerName) {
                room.currentVideo.colorHue = newHue;
            }

            console.log(`[INFO] Controller "${controllerName}" updated color to hue ${newHue}`);
            socket.emit('controller-color-updated', { colorHue: newHue });
            io.to(roomId).emit('queue-updated', room.queue);
            io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
        } catch (error) {
            console.log(`[ERR] Failed to update controller color:`, error.message);
            socket.emit('error-message', { type: 'update-controller-color', message: 'Failed to update color' });
        }
    });

    // Add to queue (requires controllerKey)
    socket.on('add-to-queue', ({ roomId, video, controllerKey }) => {
        console.log(`[INFO] Received add-to-queue event from socket ${socket.id} for room ${roomId}`);

        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'add-to-queue', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'add-to-queue', message: auth.error });
                return;
            }

            if (!video || !video.id || !video.title) {
                socket.emit('error-message', { type: 'add-to-queue', message: 'Invalid video data provided' });
                return;
            }

            if (room.queue.length >= LIMITS.maxQueueLengthPerRoom) {
                socket.emit('error-message', { type: 'add-to-queue', message: 'Queue is at maximum capacity' });
                return;
            }

            if (typeof video.title !== 'string' || video.title.length > LIMITS.maxVideoTitleLength) {
                socket.emit('error-message', { type: 'add-to-queue', message: `Video title must be ${LIMITS.maxVideoTitleLength} characters or less` });
                return;
            }

            if (typeof video.id !== 'string' || video.id.length > LIMITS.maxVideoIdLength) {
                socket.emit('error-message', { type: 'add-to-queue', message: 'Invalid video ID' });
                return;
            }

            // Use the controller's registered name and color
            const videoData = {
                ...video,
                addedBy: auth.controller.name,
                colorHue: auth.controller.colorHue,
                queueId: room.nextQueueId++,
            };

            if (room.queue.length === 0 && !room.currentVideo) {
                console.log(`[INFO] Setting first video as current: ${video.title}`);
                setCurrentVideo(room, videoData);
                io.to(roomId).emit('video-changed', room.currentVideo);
            } else {
                room.queue.push(videoData);
                reorderQueueRoundRobin(room);
                console.log(`[INFO] Added video "${video.title}" to queue by ${auth.controller.name}`);
            }
            
            console.log(`[INFO] Current queue length: ${room.queue.length}`);
            io.to(roomId).emit('queue-updated', room.queue);
        } catch (error) {
            console.log(`[ERR] Failed to add video to queue:`, error.message);
            socket.emit('error-message', { type: 'add-to-queue', message: 'Failed to add video to queue' });
        }
    });

    // Play next (requires controllerKey)
    socket.on('play-next', ({ roomId, controllerKey }) => {
        console.log(`[INFO] Received play-next event from socket ${socket.id} for room ${roomId}`);

        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'play-next', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'play-next', message: auth.error });
                return;
            }

            if (room.queue.length > 0) {
                const nextVideo = room.queue.shift();
                setCurrentVideo(room, nextVideo);
                console.log(`[INFO] Playing next video "${room.currentVideo.title}" in room ${roomId}`);
                io.to(roomId).emit('video-changed', room.currentVideo);
                io.to(roomId).emit('queue-updated', room.queue);
            } else {
                console.log(`[INFO] No videos in queue for room ${roomId}`);
                if (room.currentVideo) {
                    setCurrentVideo(room, null);
                    io.to(roomId).emit('video-changed', null);
                }
                io.to(roomId).emit('queue-updated', []);
            }
        } catch (error) {
            console.log(`[ERR] Failed to play next video:`, error.message);
            socket.emit('error-message', { type: 'play-next', message: 'Failed to skip to next video' });
        }
    });

    // Play next from player (requires playerKey) - used for auto-advance
    socket.on('player-play-next', ({ roomId, playerKey }) => {
        console.log(`[INFO] Received player-play-next event from socket ${socket.id} for room ${roomId}`);

        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'player-play-next', message: 'Room not found' });
                return;
            }

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                // Silently ignore invalid player key for auto-advance
                return;
            }

            if (room.queue.length > 0) {
                const nextVideo = room.queue.shift();
                setCurrentVideo(room, nextVideo);
                console.log(`[INFO] Auto-advancing to next video "${room.currentVideo.title}" in room ${roomId}`);
                io.to(roomId).emit('video-changed', room.currentVideo);
                io.to(roomId).emit('queue-updated', room.queue);
            } else {
                console.log(`[INFO] No videos in queue for auto-advance in room ${roomId}`);
                if (room.currentVideo) {
                    setCurrentVideo(room, null);
                    io.to(roomId).emit('video-changed', null);
                }
                io.to(roomId).emit('queue-updated', []);
            }
        } catch (error) {
            console.log(`[ERR] Failed to auto-advance video:`, error.message);
        }
    });

    // Request current room state (for controllers that need to refresh)
    socket.on('request-room-state', ({ roomId }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;
            
            // Only send if socket is in the room
            if (currentRoom === roomId) {
                socket.emit('room-state', getPublicRoomState(room));
            }
        } catch (error) {
            console.log(`[ERR] Failed to send room state:`, error.message);
        }
    });

    // Remove from queue (requires controllerKey)
    socket.on('remove-from-queue', ({ roomId, index, controllerKey }) => {
        console.log(`[INFO] Received remove-from-queue event for room ${roomId}, index: ${index}`);

        try {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error-message', { type: 'remove-from-queue', message: 'Room not found' });
                return;
            }

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'remove-from-queue', message: auth.error });
                return;
            }

            if (typeof index !== 'number' || index < 0 || room.queue.length <= index) {
                socket.emit('error-message', { type: 'remove-from-queue', message: 'Invalid queue index' });
                return;
            }

            const removedVideo = room.queue.splice(index, 1)[0];
            if (room.settings.roundRobinEnabled) {
                reorderQueueRoundRobin(room);
            }
            console.log(`[INFO] Removed video "${removedVideo.title}" from queue`);
            io.to(roomId).emit('queue-updated', room.queue);
        } catch (error) {
            console.log(`[ERR] Failed to remove video from queue:`, error.message);
            socket.emit('error-message', { type: 'remove-from-queue', message: 'Failed to remove video from queue' });
        }
    });

    // Update settings (requires controllerKey)
    socket.on('update-settings', ({ roomId, settings, controllerKey }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;

            const auth = validateControllerKey(room, controllerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'update-settings', message: auth.error });
                return;
            }

            if (settings && typeof settings.roundRobinEnabled === 'boolean') {
                room.settings.roundRobinEnabled = settings.roundRobinEnabled;
                reorderQueueRoundRobin(room);
                io.to(roomId).emit('queue-updated', room.queue);
            }
            io.to(roomId).emit('settings-updated', room.settings);
        } catch (error) {
            console.log(`[ERR] Failed to update settings:`, error.message);
        }
    });

    // Playback state update (requires playerKey)
    socket.on('playback-state', ({ roomId, playerKey, state, positionSec, durationSec, videoId }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                // Silently ignore - don't spam errors for playback updates
                return;
            }

            if (state) room.playback.state = state;
            if (typeof positionSec === 'number') room.playback.positionSec = positionSec;
            if (typeof durationSec === 'number') room.playback.durationSec = durationSec;
            if (typeof videoId === 'string' || videoId === null) room.playback.videoId = videoId;
            room.playback.updatedAt = Date.now();
            io.to(roomId).emit('playback-updated', room.playback);
        } catch (error) {
            console.log(`[ERR] Failed to process playback-state:`, error.message);
        }
    });

    // ----- Admin Actions (require playerKey) -----

    // Toggle controller enabled/disabled
    socket.on('admin-toggle-controller', ({ roomId, playerKey, controllerId, enabled }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'admin-toggle-controller', message: auth.error });
                return;
            }

            // Find controller by partial key (id is first 8 chars)
            for (const [key, controller] of room.controllers.entries()) {
                if (key.substring(0, 8) === controllerId) {
                    controller.enabled = enabled;
                    console.log(`[INFO] Controller "${controller.name}" ${enabled ? 'enabled' : 'disabled'}`);
                    io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
                    return;
                }
            }
            socket.emit('error-message', { type: 'admin-toggle-controller', message: 'Controller not found' });
        } catch (error) {
            console.log(`[ERR] Failed to toggle controller:`, error.message);
        }
    });

    // Remove controller
    socket.on('admin-remove-controller', ({ roomId, playerKey, controllerId }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'admin-remove-controller', message: auth.error });
                return;
            }

            for (const [key, controller] of room.controllers.entries()) {
                if (key.substring(0, 8) === controllerId) {
                    room.controllers.delete(key);
                    console.log(`[INFO] Controller "${controller.name}" removed`);
                    io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
                    return;
                }
            }
            socket.emit('error-message', { type: 'admin-remove-controller', message: 'Controller not found' });
        } catch (error) {
            console.log(`[ERR] Failed to remove controller:`, error.message);
        }
    });

    // Toggle allow new controllers
    socket.on('admin-toggle-registration', ({ roomId, playerKey, allow }) => {
        try {
            const room = rooms.get(roomId);
            if (!room) return;

            const auth = validatePlayerKey(room, playerKey);
            if (!auth.valid) {
                socket.emit('error-message', { type: 'admin-toggle-registration', message: auth.error });
                return;
            }

            room.allowNewControllers = allow;
            console.log(`[INFO] Room ${roomId} registration ${allow ? 'enabled' : 'disabled'}`);
            io.to(roomId).emit('registration-status', { allowNewControllers: allow });
            io.to(`${roomId}:admin`).emit('controllers-updated', getAdminRoomState(room).controllers);
        } catch (error) {
            console.log(`[ERR] Failed to toggle registration:`, error.message);
        }
    });

    // Leave room
    socket.on('leave-room', (roomId) => {
        try {
            if (!roomId || typeof roomId !== 'string') return;
            socket.leave(roomId);
            socket.leave(`${roomId}:admin`);
            if (currentRoom === roomId) currentRoom = null;
            console.log(`[INFO] Socket ${socket.id} left room: ${roomId}`);
        } catch (error) {
            console.log(`[ERR] Failed to leave room:`, error.message);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom) {
            console.log(`[INFO] Socket ${socket.id} disconnected from room: ${currentRoom}`);
        }
    });

    socket.on('error', (error) => {
        console.error(`[ERR] Socket ${socket.id} error:`, error);
    });
});

server.listen(PORT, () => {
    console.log(`[INFO] Server running on port ${PORT}`);
    console.log(`[INFO] Socket.IO path: ${NODE_ENV === 'production' ? '/ws/' : '/socket.io/'}`);
});

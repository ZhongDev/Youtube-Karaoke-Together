import io from 'socket.io-client';

// Load configuration
const config = require('./ytkt-config.json');

const API_URL = `${config.backend.ssl ? 'https' : 'http'}://${config.backend.hostname}:${config.backend.port}`;

const socket = io(API_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

export default socket; 
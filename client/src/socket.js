import io from 'socket.io-client';
import config from './ytkt-config.json';

const API_URL = `${config.backend.ssl ? 'https' : 'http'}://${config.backend.hostname}:${config.backend.port}`;

const socket = io(API_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

export default socket; 
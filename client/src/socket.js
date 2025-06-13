import io from 'socket.io-client';

const API_URL = window.location.protocol + '//' + window.location.hostname + ':8443';

const socket = io(API_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

export default socket; 
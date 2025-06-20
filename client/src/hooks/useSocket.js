import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import config from '../ytkt-config.json';

// Single socket instance to be shared across components
let socketInstance = null;

const useSocket = (backendUrl = null) => {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const hasJoinedRoomRef = useRef(new Set());

    useEffect(() => {
        const url = backendUrl || `${config.backend.ssl ? 'https' : 'http'}://${config.backend.hostname}:${config.backend.port}`;

        // Create socket instance if it doesn't exist or URL changed
        if (!socketInstance || socketInstance.io.uri !== url) {
            if (socketInstance) {
                socketInstance.disconnect();
            }

            socketInstance = io(url, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                timeout: 20000
            });
        }

        const socket = socketInstance;

        const handleConnect = () => {
            console.log('[INFO] Socket connected');
            setIsConnected(true);
            setConnectionError(null);
        };

        const handleConnectError = (error) => {
            console.error('[ERR] Socket connection error:', error);
            setIsConnected(false);
            setConnectionError(error.message || 'Connection failed');
        };

        const handleDisconnect = (reason) => {
            console.log('[INFO] Socket disconnected:', reason);
            setIsConnected(false);
            hasJoinedRoomRef.current.clear();
        };

        const handleError = (error) => {
            console.error('[ERR] Socket error:', error);
            setConnectionError(error.message || 'Socket error');
        };

        const handleServerError = (errorData) => {
            console.error('[ERR] Server error:', errorData);
            setServerError({
                type: errorData.type,
                message: errorData.message,
                timestamp: Date.now()
            });
        };

        // Set up event listeners
        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('disconnect', handleDisconnect);
        socket.on('error', handleError);
        socket.on('error-message', handleServerError);

        // Set initial connection state
        setIsConnected(socket.connected);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleConnectError);
            socket.off('disconnect', handleDisconnect);
            socket.off('error', handleError);
            socket.off('error-message', handleServerError);
        };
    }, [backendUrl]);

    const joinRoom = (roomId) => {
        if (socketInstance && socketInstance.connected && roomId && !hasJoinedRoomRef.current.has(roomId)) {
            console.log('[INFO] Joining room:', roomId);
            socketInstance.emit('join-room', roomId);
            hasJoinedRoomRef.current.add(roomId);
        }
    };

    const leaveRoom = (roomId) => {
        if (socketInstance && roomId && hasJoinedRoomRef.current.has(roomId)) {
            console.log('[INFO] Leaving room:', roomId);
            socketInstance.emit('leave-room', roomId);
            hasJoinedRoomRef.current.delete(roomId);
        }
    };

    const clearServerError = () => {
        setServerError(null);
    };

    return {
        socket: socketInstance,
        isConnected,
        connectionError,
        serverError,
        clearServerError,
        joinRoom,
        leaveRoom
    };
};

export default useSocket; 
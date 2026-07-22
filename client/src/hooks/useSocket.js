import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { CURRENT_PRIVACY_POLICY_VERSION, getSocketConfig } from '../config';

// Single socket instance to be shared across components
let socketInstance = null;
let currentSocketUrl = null;
const joinedMemberships = new Set();
const joiningMemberships = new Set();

function socketRequest({ event, payload, timeoutMessage }) {
    return new Promise((resolve, reject) => {
        if (!socketInstance?.connected) {
            const error = new Error('Not connected');
            error.code = 'not_connected';
            reject(error);
            return;
        }
        socketInstance.timeout(10000).emit(event, payload, (timeoutError, response) => {
            if (timeoutError) {
                const error = new Error(timeoutMessage);
                error.code = 'timeout';
                reject(error);
                return;
            }
            if (!response?.ok) {
                const error = new Error(response?.error?.message || 'The request could not be completed');
                error.code = response?.error?.code || 'request_failed';
                reject(error);
                return;
            }
            const { ok, ...data } = response;
            resolve(data);
        });
    });
}

const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [serverError, setServerError] = useState(null);

    useEffect(() => {
        const { url, options } = getSocketConfig();

        // Create socket instance if it doesn't exist or URL changed
        if (!socketInstance || currentSocketUrl !== url) {
            if (socketInstance) {
                socketInstance.disconnect();
            }

            console.log('[INFO] Creating socket connection to:', url, 'with options:', options);
            socketInstance = io(url, options);
            currentSocketUrl = url;
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
            joinedMemberships.clear();
            joiningMemberships.clear();
        };

        const handleError = (error) => {
            console.error('[ERR] Socket error:', error);
            setConnectionError(error.message || 'Socket error');
        };

        const handleServerError = (errorData) => {
            console.error('[ERR] Server error:', errorData);
            setServerError({
                type: errorData.type,
                code: errorData.code,
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
    }, []);

    // Join room (public view, no auth required)
    const joinRoom = useCallback((roomId) => {
        if (socketInstance && socketInstance.connected && roomId && !joinedMemberships.has(roomId) && !joiningMemberships.has(roomId)) {
            console.log('[INFO] Joining room:', roomId);
            joiningMemberships.add(roomId);
            socketInstance.timeout(10000).emit('join-room', { roomId }, (error, response) => {
                joiningMemberships.delete(roomId);
                if (!error && response?.ok) { joinedMemberships.clear(); joinedMemberships.add(roomId); }
            });
        }
    }, []);

    // Join room as admin (with playerKey)
    const joinRoomAdmin = useCallback((roomId, playerKey) => {
        const adminKey = `${roomId}:admin`;
        if (socketInstance && socketInstance.connected && roomId && playerKey && !joinedMemberships.has(adminKey) && !joiningMemberships.has(adminKey)) {
            console.log('[INFO] Joining room as admin:', roomId);
            joiningMemberships.add(adminKey);
            socketInstance.timeout(10000).emit('join-room-admin', { roomId, playerKey }, (error, response) => {
                joiningMemberships.delete(adminKey);
                if (!error && response?.ok) { joinedMemberships.clear(); joinedMemberships.add(adminKey); }
            });
        }
    }, []);

    // Register a new controller
    const registerController = useCallback((roomId, controlMasterKey, username) => {
        return socketRequest({
            event: 'register-controller', payload: {
                roomId,
                controlMasterKey,
                username,
                policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
            },
            timeoutMessage: 'Registration timeout',
        }).then((data) => {
            joinedMemberships.clear();
            joinedMemberships.add(roomId);
            return data;
        });
    }, []);

    // Authenticate with existing controller key
    const authController = useCallback((roomId, controllerKey) => {
        return socketRequest({
            event: 'auth-controller', payload: { roomId, controllerKey },
            timeoutMessage: 'Authentication timeout',
        }).then((data) => {
            joinedMemberships.clear();
            joinedMemberships.add(roomId);
            return data;
        });
    }, []);

    // Rename controller
    const renameController = useCallback((roomId, controllerKey, newName) => {
        return socketRequest({
            event: 'rename-controller', payload: { roomId, controllerKey, newName },
            timeoutMessage: 'Rename timeout',
        });
    }, []);

    // Update controller color
    const updateControllerColor = useCallback((roomId, controllerKey, colorHue) => {
        return socketRequest({
            event: 'update-controller-color', payload: { roomId, controllerKey, colorHue },
            timeoutMessage: 'Color update timeout',
        });
    }, []);

    const leaveRoom = useCallback((roomId) => {
        if (socketInstance && roomId && (joinedMemberships.has(roomId) || joinedMemberships.has(`${roomId}:admin`))) {
            console.log('[INFO] Leaving room:', roomId);
            socketInstance.emit('leave-room', roomId);
            joinedMemberships.delete(roomId);
            joinedMemberships.delete(`${roomId}:admin`);
            joiningMemberships.delete(roomId);
            joiningMemberships.delete(`${roomId}:admin`);
        }
    }, []);

    const clearServerError = useCallback(() => {
        setServerError(null);
    }, []);

    return {
        socket: socketInstance,
        isConnected,
        connectionError,
        serverError,
        clearServerError,
        joinRoom,
        joinRoomAdmin,
        registerController,
        authController,
        renameController,
        updateControllerColor,
        leaveRoom
    };
};

export default useSocket;

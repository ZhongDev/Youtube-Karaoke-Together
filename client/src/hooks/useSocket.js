import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { getSocketConfig } from '../config';

// Single socket instance to be shared across components
let socketInstance = null;
let currentSocketUrl = null;

const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [serverError, setServerError] = useState(null);
    const hasJoinedRoomRef = useRef(new Set());

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
    }, []);

    // Join room (public view, no auth required)
    const joinRoom = useCallback((roomId) => {
        if (socketInstance && socketInstance.connected && roomId && !hasJoinedRoomRef.current.has(roomId)) {
            console.log('[INFO] Joining room:', roomId);
            socketInstance.emit('join-room', { roomId });
            hasJoinedRoomRef.current.add(roomId);
        }
    }, []);

    // Join room as admin (with playerKey)
    const joinRoomAdmin = useCallback((roomId, playerKey) => {
        const adminKey = `${roomId}:admin`;
        if (socketInstance && socketInstance.connected && roomId && playerKey && !hasJoinedRoomRef.current.has(adminKey)) {
            console.log('[INFO] Joining room as admin:', roomId);
            socketInstance.emit('join-room-admin', { roomId, playerKey });
            hasJoinedRoomRef.current.add(adminKey);
        }
    }, []);

    // Register a new controller
    const registerController = useCallback((roomId, controlMasterKey, username) => {
        return new Promise((resolve, reject) => {
            if (!socketInstance || !socketInstance.connected) {
                reject(new Error('Not connected'));
                return;
            }

            const handleRegistered = (data) => {
                socketInstance.off('controller-registered', handleRegistered);
                socketInstance.off('error-message', handleError);
                resolve(data);
            };

            const handleError = (error) => {
                if (error.type === 'register-controller') {
                    socketInstance.off('controller-registered', handleRegistered);
                    socketInstance.off('error-message', handleError);
                    reject(new Error(error.message));
                }
            };

            socketInstance.on('controller-registered', handleRegistered);
            socketInstance.on('error-message', handleError);

            socketInstance.emit('register-controller', { roomId, controlMasterKey, username });

            // Timeout after 10 seconds
            setTimeout(() => {
                socketInstance.off('controller-registered', handleRegistered);
                socketInstance.off('error-message', handleError);
                reject(new Error('Registration timeout'));
            }, 10000);
        });
    }, []);

    // Authenticate with existing controller key
    const authController = useCallback((roomId, controllerKey) => {
        return new Promise((resolve, reject) => {
            if (!socketInstance || !socketInstance.connected) {
                reject(new Error('Not connected'));
                return;
            }

            const handleAuthenticated = (data) => {
                socketInstance.off('controller-authenticated', handleAuthenticated);
                socketInstance.off('error-message', handleError);
                hasJoinedRoomRef.current.add(roomId);
                resolve(data);
            };

            const handleError = (error) => {
                if (error.type === 'auth-controller') {
                    socketInstance.off('controller-authenticated', handleAuthenticated);
                    socketInstance.off('error-message', handleError);
                    reject(new Error(error.message));
                }
            };

            socketInstance.on('controller-authenticated', handleAuthenticated);
            socketInstance.on('error-message', handleError);

            socketInstance.emit('auth-controller', { roomId, controllerKey });

            // Timeout after 10 seconds
            setTimeout(() => {
                socketInstance.off('controller-authenticated', handleAuthenticated);
                socketInstance.off('error-message', handleError);
                reject(new Error('Authentication timeout'));
            }, 10000);
        });
    }, []);

    const leaveRoom = useCallback((roomId) => {
        if (socketInstance && roomId && hasJoinedRoomRef.current.has(roomId)) {
            console.log('[INFO] Leaving room:', roomId);
            socketInstance.emit('leave-room', roomId);
            hasJoinedRoomRef.current.delete(roomId);
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
        leaveRoom
    };
};

export default useSocket;

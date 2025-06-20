import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    IconButton,
    Paper,
    Typography,
    Chip,
    BottomNavigation,
    BottomNavigationAction,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControlLabel,
    Checkbox,
    Alert,
    Snackbar
} from '@mui/material';
import {
    Search as SearchIcon,
    QueueMusic as QueueIcon,
    Settings as SettingsIcon,
    SkipNext as SkipIcon
} from '@mui/icons-material';
import { Add as AddIcon, PlaylistAdd as PlaylistIcon } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import Queue from './Queue';
import Settings from './Settings';
import useSocket from '../hooks/useSocket';
import config from '../ytkt-config.json';

const Control = () => {
    const { roomId } = useParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextPageToken, setNextPageToken] = useState(null);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
    const [username, setUsername] = useState(() => {
        const savedUsername = localStorage.getItem('karaokeUsername');
        return savedUsername || '';
    });
    const [rememberMe, setRememberMe] = useState(() => {
        return localStorage.getItem('karaokeRememberMe') === 'true';
    });
    const [showNameModal, setShowNameModal] = useState(() => {
        const rememberMe = localStorage.getItem('karaokeRememberMe');
        const hasUsername = localStorage.getItem('karaokeUsername');

        // Show modal if user hasn't chosen to remember (rememberMe !== 'true')
        // This covers:
        // 1. First time users (rememberMe is null)
        // 2. Users who explicitly chose not to remember (rememberMe === 'false')
        // 3. Users with no username
        if (rememberMe !== 'true') {
            return true;
        }

        // If remember is true but no username, still show modal
        return !hasUsername;
    });
    const [currentTab, setCurrentTab] = useState(0);
    const [hasSearched, setHasSearched] = useState(false);
    const loadingRef = useRef(false);
    const observer = useRef();

    // Use the socket hook
    const { socket, isConnected, connectionError, serverError, clearServerError, joinRoom } = useSocket();

    const loadMoreResults = useCallback(async () => {
        if (!nextPageToken || loadingRef.current) return;

        loadingRef.current = true;
        setIsLoadingMore(true);

        try {
            const query = searchQuery.trim();
            console.log('[INFO] Loading more results for:', query, 'with token:', nextPageToken);
            const API_URL = `${config.backend.ssl ? 'https' : 'http'}://${config.backend.hostname}:${config.backend.port}`;
            const response = await fetch(
                `${API_URL}/api/search?query=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(nextPageToken)}`
            );
            if (!response.ok) {
                throw new Error(`Load more failed with status: ${response.status}`);
            }
            const data = await response.json();
            console.log('[INFO] Load more results:', data);

            const transformedResults = data.items.map(item => ({
                id: item.id.videoId || item.id.playlistId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                isPlaylist: !!item.id.playlistId
            }));

            setSearchResults(prevResults => {
                const existingIds = new Set(prevResults.map(r => r.id));
                const newResults = transformedResults.filter(r => !existingIds.has(r.id));
                return [...prevResults, ...newResults];
            });

            setNextPageToken(data.nextPageToken);
        } catch (error) {
            console.error('[ERR] Load more failed:', error);
        } finally {
            setIsLoadingMore(false);
            loadingRef.current = false;
        }
    }, [nextPageToken, searchQuery]);

    const lastResultRef = useCallback(node => {
        if (loadingRef.current || !nextPageToken) return;

        if (observer.current) {
            observer.current.disconnect();
        }

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !loadingRef.current && nextPageToken) {
                loadMoreResults();
            }
        }, {
            threshold: 0.5
        });

        if (node) {
            observer.current.observe(node);
        }
    }, [nextPageToken, loadMoreResults]);

    // Handle initial username setup
    useEffect(() => {
        const rememberMe = localStorage.getItem('karaokeRememberMe');
        const savedUsername = localStorage.getItem('karaokeUsername');

        // If user chose not to remember, we should clear the username on page load
        // to force them to enter it again
        if (rememberMe === 'false') {
            localStorage.removeItem('karaokeUsername');
            setUsername('');
        } else if (savedUsername) {
            setUsername(savedUsername);
        }
    }, []);

    // Join room when connected
    useEffect(() => {
        if (!roomId) {
            console.error('[ERR] No roomId provided');
            return;
        }

        console.log('[INFO] Control component mounted, roomId:', roomId);

        if (isConnected) {
            joinRoom(roomId);
        }
    }, [roomId, isConnected, joinRoom]);

    // Show connection error notifications
    useEffect(() => {
        if (connectionError) {
            setNotification({
                open: true,
                message: `Connection Error: ${connectionError}`,
                severity: 'error'
            });
        }
    }, [connectionError]);

    // Show server error notifications
    useEffect(() => {
        if (serverError) {
            setNotification({
                open: true,
                message: `Server Error: ${serverError.message}`,
                severity: 'error'
            });
            // Clear the server error after showing notification
            clearServerError();
        }
    }, [serverError, clearServerError]);

    // Listen for username changes from Settings
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'karaokeUsername' && e.newValue) {
                setUsername(e.newValue);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const handleSearch = async () => {
        const query = searchQuery.trim();
        if (!query) return;

        setIsSearching(true);
        setNextPageToken(null);
        setHasSearched(true); // Mark that a search has been performed
        try {
            console.log('[INFO] Searching for:', query);
            const API_URL = `${config.backend.ssl ? 'https' : 'http'}://${config.backend.hostname}:${config.backend.port}`;
            const response = await fetch(`${API_URL}/api/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`Search failed with status: ${response.status}`);
            }
            const data = await response.json();
            console.log('[INFO] Search results:', data);

            const transformedResults = data.items.map(item => ({
                id: item.id.videoId || item.id.playlistId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                isPlaylist: !!item.id.playlistId
            }));

            console.log('[INFO] Transformed results:', transformedResults);
            setSearchResults(transformedResults);
            setNextPageToken(data.nextPageToken);
        } catch (error) {
            console.error('[ERR] Search failed:', error);
            setSearchResults([]);
            setNotification({
                open: true,
                message: `Search failed: ${error.message}`,
                severity: 'error'
            });
        } finally {
            setIsSearching(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    const addToQueue = (video) => {
        if (!username.trim()) {
            setCurrentTab(2); // Switch to settings tab
            setNotification({
                open: true,
                message: 'Please set your name in settings first!',
                severity: 'warning'
            });
            return;
        }

        if (!isConnected) {
            setNotification({
                open: true,
                message: 'Not connected to server. Please wait for connection.',
                severity: 'error'
            });
            return;
        }

        console.log('[INFO] Adding to queue:', video);
        const videoData = {
            ...video,
            addedBy: username
        };
        socket.emit('add-to-queue', { roomId, video: videoData });

        setNotification({
            open: true,
            message: `Added "${video.title}" to queue!`,
            severity: 'success'
        });
    };

    const handleNameSubmit = () => {
        if (username.trim()) {
            // Always save the username to localStorage
            localStorage.setItem('karaokeUsername', username);

            if (rememberMe) {
                localStorage.setItem('karaokeRememberMe', 'true');
            } else {
                localStorage.removeItem('karaokeRememberMe');
            }
            setShowNameModal(false);
        }
    };

    const handleSkip = () => {
        if (!username.trim()) {
            setShowNameModal(true);
            return;
        }
        socket.emit('play-next', roomId);
    };

    const renderSearchTab = () => (
        <Box sx={{ maxWidth: 600, mx: 'auto', width: '100%', p: 2 }}>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                <Typography variant="h5" gutterBottom>
                    Search
                </Typography>
                {!hasSearched && (
                    <Box sx={{ mb: 2, p: 1, bgcolor: 'info.light', borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ color: 'info.contrastText' }}>
                            This service uses YouTube API Services. By using this app, you agree to the{' '}
                            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"
                                style={{ color: 'inherit', textDecoration: 'underline' }}>
                                YouTube Terms of Service
                            </a>.
                        </Typography>
                    </Box>
                )}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="Search for a video..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={!isConnected || isSearching}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSearch}
                        disabled={!isConnected || isSearching || !searchQuery.trim()}
                    >
                        {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                </Box>
            </Paper>

            <Paper elevation={3} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Search Results {searchResults.length > 0 && `(${searchResults.length})`}
                </Typography>
                <List>
                    {searchResults.map((result, index) => (
                        <ListItem
                            key={result.id}
                            divider
                            ref={index === searchResults.length - 1 ? lastResultRef : null}
                            secondaryAction={
                                <IconButton
                                    edge="end"
                                    onClick={() => addToQueue(result)}
                                    disabled={!isConnected}
                                >
                                    <AddIcon />
                                </IconButton>
                            }
                        >
                            <ListItemAvatar>
                                <Avatar
                                    variant="rounded"
                                    src={`https://img.youtube.com/vi/${result.id}/mqdefault.jpg`}
                                    alt={result.title}
                                />
                            </ListItemAvatar>
                            <ListItemText
                                primary={result.title}
                                secondary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {result.channelTitle}
                                        </Typography>
                                        {result.isPlaylist && (
                                            <Chip
                                                size="small"
                                                icon={<PlaylistIcon />}
                                                label="Playlist"
                                                color="primary"
                                                variant="outlined"
                                            />
                                        )}
                                    </Box>
                                }
                            />
                        </ListItem>
                    ))}
                    {isLoadingMore && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                            <CircularProgress size={24} />
                        </Box>
                    )}
                </List>
            </Paper>
        </Box>
    );

    const renderControlsTab = () => (
        <Box sx={{ maxWidth: 600, mx: 'auto', width: '100%', p: 2 }}>
            <Paper elevation={3} sx={{ p: 2 }}>
                <Typography variant="h5" gutterBottom>
                    Controls {!isConnected && '(Disconnected)'}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<SkipIcon />}
                        onClick={handleSkip}
                        disabled={!isConnected}
                    >
                        Skip Current Song
                    </Button>
                </Box>
            </Paper>
        </Box>
    );

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            pb: 7
        }}>
            <Dialog
                open={showNameModal}
                onClose={() => { }}
                disableEscapeKeyDown
                disableBackdropClick
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ textAlign: 'center' }}>Enter Your Name</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Your Name"
                        fullWidth
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                color="primary"
                            />
                        }
                        label="Remember me"
                    />
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
                    <Button
                        onClick={handleNameSubmit}
                        variant="contained"
                        disabled={!username.trim()}
                        sx={{ minWidth: 120 }}
                    >
                        Continue
                    </Button>
                </DialogActions>
            </Dialog>

            {currentTab === 0 && renderSearchTab()}
            {currentTab === 1 && <Queue />}
            {currentTab === 2 && renderControlsTab()}
            {currentTab === 3 && <Settings />}

            <BottomNavigation
                value={currentTab}
                onChange={(event, newValue) => {
                    setCurrentTab(newValue);
                }}
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderTop: 1,
                    borderColor: 'divider'
                }}
            >
                <BottomNavigationAction label="Search" icon={<SearchIcon />} />
                <BottomNavigationAction label="Queue" icon={<QueueIcon />} />
                <BottomNavigationAction label="Controls" icon={<SkipIcon />} />
                <BottomNavigationAction label="Settings" icon={<SettingsIcon />} />
            </BottomNavigation>

            <Snackbar
                open={notification.open}
                autoHideDuration={4000}
                onClose={() => setNotification({ ...notification, open: false })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setNotification({ ...notification, open: false })}
                    severity={notification.severity}
                    sx={{ width: '100%' }}
                >
                    {notification.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Control; 
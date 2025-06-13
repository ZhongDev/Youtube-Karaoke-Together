import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    FormControlLabel,
    Checkbox
} from '@mui/material';

const Settings = () => {
    const [username, setUsername] = useState(() => {
        const savedUsername = localStorage.getItem('karaokeUsername');
        return savedUsername || '';
    });
    const [rememberMe, setRememberMe] = useState(() => {
        return localStorage.getItem('karaokeRememberMe') === 'true';
    });

    // Listen for changes to localStorage
    useEffect(() => {
        const handleStorageChange = () => {
            const savedUsername = localStorage.getItem('karaokeUsername');
            if (savedUsername !== username) {
                setUsername(savedUsername || '');
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [username]);

    const handleSave = () => {
        if (username.trim()) {
            if (rememberMe) {
                localStorage.setItem('karaokeUsername', username);
                localStorage.setItem('karaokeRememberMe', 'true');
            } else {
                localStorage.removeItem('karaokeUsername');
                localStorage.removeItem('karaokeRememberMe');
            }
        }
    };

    return (
        <Box sx={{ p: 2, maxWidth: 800, mx: 'auto' }}>
            <Paper elevation={3} sx={{ p: 2 }}>
                <Typography variant="h5" gutterBottom>
                    Settings
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        fullWidth
                        label="Your Name"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
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
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!username.trim()}
                    >
                        Save Settings
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default Settings; 
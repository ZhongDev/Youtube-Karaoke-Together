import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.js',
        clearMocks: true,
    },
    server: {
        port: 3000,
        open: true,
    },
});


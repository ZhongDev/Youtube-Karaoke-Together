require('dotenv').config();
const { loadConfig } = require('./src/server/config');
const { createServer } = require('./src/server/createServer');

const config = loadConfig();
const runtime = createServer({ config });
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[INFO] Received ${signal}; shutting down gracefully.`);
    const forceTimer = setTimeout(() => {
        console.error('[ERR] Graceful shutdown timed out.');
        process.exit(1);
    }, 10_000);
    forceTimer.unref();
    try {
        await runtime.stop();
        clearTimeout(forceTimer);
        process.exit(0);
    } catch (error) {
        console.error(`[ERR] Shutdown failed: ${error.stack || error.message}`);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

runtime.start().then((address) => {
    console.info(`[INFO] Server v3.0.0 running on port ${address.port}`);
    console.info(`[INFO] Socket.IO path: ${config.socketPath}`);
    console.info(`[INFO] SQLite database: ${config.databasePath}`);
}).catch((error) => {
    console.error(`[ERR] Startup failed: ${error.stack || error.message}`);
    process.exit(1);
});

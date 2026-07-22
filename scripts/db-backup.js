require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/server/config');
const { AppDatabase } = require('../src/server/database');

async function main() {
    const config = loadConfig();
    if (config.databasePath === ':memory:') throw new Error('Cannot back up an in-memory database');
    const backupDir = process.env.BACKUP_DIR || path.join(config.rootDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(backupDir, `youtube-karaoke-${stamp}.sqlite`);
    const db = new AppDatabase(config.databasePath);
    try {
        db.purgeExpired(Date.now() - config.historyRetentionMs);
        await db.backupTo(destination);
        const cutoff = Date.now() - config.backupRetentionMs;
        for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
            if (!entry.isFile() || !/^youtube-karaoke-.*\.sqlite$/.test(entry.name)) continue;
            const filename = path.join(backupDir, entry.name);
            if (filename !== destination && fs.statSync(filename).mtimeMs < cutoff) fs.unlinkSync(filename);
        }
        console.log(destination);
    } finally {
        db.close();
    }
}

main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
});

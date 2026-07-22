require('dotenv').config();
const { loadConfig } = require('../src/server/config');
const { AppDatabase } = require('../src/server/database');

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run admin:recover -- owner@example.com');
    process.exit(1);
}

const config = loadConfig();
const db = new AppDatabase(config.databasePath);
try {
    const user = db.recoverOwnerByEmail(email);
    if (!user) throw new Error('No existing administrator identity has that email');
    console.log(`Recovered owner access for ${user.email}. Existing sessions were revoked; sign in again with the linked provider.`);
} catch (error) {
    console.error(`Recovery failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    db.close();
}

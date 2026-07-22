require('dotenv').config();
const { loadConfig } = require('../src/server/config');
const { AppDatabase } = require('../src/server/database');
const { AdminService } = require('../src/server/adminService');

const config = loadConfig();
const db = new AppDatabase(config.databasePath);

try {
    const service = new AdminService({ db, config });
    const result = service.createBootstrapCode();
    console.log('One-time owner bootstrap code:');
    console.log(result.code);
    console.log(`Expires: ${new Date(result.expiresAt).toISOString()}`);
    console.log('Use this only with a successful Google sign-in on /admin/bootstrap.');
} catch (error) {
    console.error(`Bootstrap failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    db.close();
}

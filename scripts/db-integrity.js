require('dotenv').config();
const Database = require('better-sqlite3');
const { loadConfig } = require('../src/server/config');

const config = loadConfig();
const db = new Database(config.databasePath, { readonly: true, fileMustExist: true });
try {
    const results = db.pragma('integrity_check');
    const healthy = results.length === 1 && results[0].integrity_check === 'ok';
    console.log(JSON.stringify(results));
    if (!healthy) process.exitCode = 1;
} finally {
    db.close();
}

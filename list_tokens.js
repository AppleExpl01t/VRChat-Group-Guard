const Database = require('better-sqlite3');
const db = new Database('/home/ubuntu/group-guard-backend/data/groupguard.db', { readonly: true });
const invites = db.prepare('SELECT token FROM invites').all();
console.log('--- DB TOKENS ---');
invites.forEach(i => console.log(`"${i.token}"`));

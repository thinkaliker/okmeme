import { db } from '../db.js';
import { migrate } from './migrate.js';

const ran = await migrate();

if (ran.length === 0) console.log('migrations: already up to date');
else for (const name of ran) console.log(`migrations: applied ${name}`);

await db.$disconnect();

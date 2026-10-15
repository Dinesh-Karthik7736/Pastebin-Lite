import 'dotenv/config';
import app from './app.js';
import { initializeDatabase, pool } from './db.js';

const port = Number(process.env.PORT ?? 3000);
await initializeDatabase();
const server = app.listen(port, () => console.log(`Pastebox API listening on ${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

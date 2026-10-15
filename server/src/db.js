import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
}

const configuredPoolMax = Number(process.env.DB_POOL_MAX ?? 5);
if (!Number.isInteger(configuredPoolMax) || configuredPoolMax < 1 || configuredPoolMax > 20) {
  throw new Error('DB_POOL_MAX must be an integer between 1 and 20.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Five connections per process leaves room under typical free-tier limits;
  // size this against the provider's total budget before increasing instances.
  max: configuredPoolMax,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 3_000,
  maxLifetimeSeconds: 1_800,
  statement_timeout: 10_000,
  lock_timeout: 3_000,
  idle_in_transaction_session_timeout: 10_000,
  application_name: 'pastebox-api',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error', error));

export async function initializeDatabase() {
  const schema = await fs.readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

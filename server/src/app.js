import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { pool } from './db.js';
import { cacheDeleteByPrefix, cacheGet, cacheSet } from './cache.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const createSchema = z.object({
  title: z.string().trim().max(120).optional().default(''),
  content: z.string().min(1, 'Paste content is required.').max(500_000, 'Content must be 500 KB or less.'),
  expiresIn: z.enum(['never', '1h', '1d', '7d', '30d']).optional().default('never'),
  maxViews: z.union([z.literal('unlimited'), z.coerce.number().int().min(1).max(100_000)]).optional().default('unlimited'),
  discoverable: z.boolean().optional().default(false)
});
const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});
const expirationMs = { never: null, '1h': 3_600_000, '1d': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(compression());
app.use(express.json({ limit: '520kb' }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

app.post('/api/pastes', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid paste.' });
    const { title, content, expiresIn, maxViews, discoverable } = parsed.data;
    const expiresAt = expirationMs[expiresIn] ? new Date(Date.now() + expirationMs[expiresIn]) : null;
    const views = maxViews === 'unlimited' ? null : maxViews;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = randomBytes(7).toString('base64url');
      try {
        await pool.query(
          'INSERT INTO pastes (id, title, content, expires_at, max_views, discoverable) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, title, content, expiresAt, views, discoverable]
        );
        await cacheDeleteByPrefix('gallery:');
        return res.status(201).json({ id, url: `${req.protocol}://${req.get('host')}/p/${id}` });
      } catch (error) {
        if (error.code !== '23505' || attempt === 2) throw error;
      }
    }
    return res.status(500).json({ error: 'Unable to create paste.' });
  } catch (error) { next(error); }
});

// Reading a paste increments its view count, so this response must not be cached.
app.get('/api/pastes/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM pastes WHERE id = $1 FOR UPDATE', [req.params.id]);
    const paste = found.rows[0];
    if (!paste || (paste.expires_at && new Date(paste.expires_at) <= new Date()) ||
        (paste.max_views !== null && paste.view_count >= paste.max_views)) {
      await client.query('COMMIT');
      res.set('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'Paste not found or expired.' });
    }
    const updated = await client.query('UPDATE pastes SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count', [paste.id]);
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    return res.json({
      id: paste.id, title: paste.title, content: paste.content, createdAt: paste.created_at,
      expiresAt: paste.expires_at, maxViews: paste.max_views, viewCount: updated.rows[0].view_count
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client.release(); }
});

app.get('/api/pastes', async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid page or search query.' });
    const { q, page, limit } = parsed.data;
    const key = `gallery:${page}:${limit}:${q.toLowerCase()}`;
    const cached = await cacheGet(key);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
      return res.json(cached);
    }
    const values = q ? [`%${q}%`, limit, (page - 1) * limit] : [limit, (page - 1) * limit];
    const predicate = q ? 'AND (title ILIKE $1 OR content ILIKE $1)' : '';
    const offsetParam = q ? '$3' : '$2';
    const limitParam = q ? '$2' : '$1';
    // Single page query, no per-row lookups; private pastes are excluded from discovery.
    const result = await pool.query(
      `SELECT id, title, LEFT(content, 240) AS preview, created_at
       FROM pastes WHERE discoverable = TRUE AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_views IS NULL OR view_count < max_views) ${predicate}
       ORDER BY created_at DESC, id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );
    const payload = { items: result.rows, page, limit, hasMore: result.rowCount === limit };
    await cacheSet(key, payload, 20);
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.json(payload);
  } catch (error) { next(error); }
});

const dist = path.resolve(here, '../../client/dist');
app.use(express.static(dist, { maxAge: '1y', immutable: true, index: false }));
app.get('/p/:id', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;

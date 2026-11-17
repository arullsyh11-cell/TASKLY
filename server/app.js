import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db.js';
import { createAuthMiddleware, resolveAuthSecret } from './auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createColumnsRouter } from './routes/columns.js';
import { createTaxonomyRouter } from './routes/taxonomy.js';
import { createTasksRouter } from './routes/tasks.js';
import { createSprintsRouter } from './routes/sprints.js';
import { createFocusRouter } from './routes/focus.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createSettingsRouter } from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

export function createApp({ dbPath = process.env.TASKLY_DB_PATH || './data/taskly.db' } = {}) {
  const db = createDatabase(dbPath);
  const secret = resolveAuthSecret(dbPath);
  const requireAuth = createAuthMiddleware(db, secret);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'taskly-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', createAuthRouter(db, secret, requireAuth));
  app.use('/api/columns', requireAuth, createColumnsRouter(db));
  app.use('/api', requireAuth, createTaxonomyRouter(db));
  app.use('/api/tasks', requireAuth, createTasksRouter(db));
  app.use('/api/sprints', requireAuth, createSprintsRouter(db));
  app.use('/api/focus', requireAuth, createFocusRouter(db));
  app.use('/api/dashboard', requireAuth, createDashboardRouter(db));
  app.use('/api/calendar', requireAuth, createCalendarRouter(db));
  app.use('/api/analytics', requireAuth, createAnalyticsRouter(db));
  app.use('/api', requireAuth, createSettingsRouter(db));

  // Serve built Vite SPA in production mode when dist/ exists
  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.use((err, req, res, _next) => {
    console.error('Unhandled API Error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan internal pada server.',
        retryable: true,
      },
    });
  });

  return { app, db };
}

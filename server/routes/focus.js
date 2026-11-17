import express from 'express';
import crypto from 'node:crypto';
import { getLocalTodayIso, logActivity, sendError } from '../helpers.js';

const VALID_MODES = new Set(['focus', 'short_break', 'long_break', 'custom']);
const VALID_STATUSES = new Set(['completed', 'interrupted']);

export function createFocusRouter(db) {
  const router = express.Router();

  router.get('/sessions', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const rows = db
      .prepare(
        `
        SELECT fs.*, t.title AS task_title
        FROM focus_sessions fs
        LEFT JOIN tasks t ON t.id = fs.task_id
        WHERE fs.user_id = ?
        ORDER BY fs.started_at DESC
        LIMIT ?
      `
      )
      .all(req.user.id, limit);

    res.json({
      sessions: rows.map((r) => ({
        ...r,
        task_label: r.task_title || (r.task_id ? 'Tugas telah dihapus' : 'Fokus Umum'),
      })),
    });
  });

  router.get('/stats', (req, res) => {
    const today = getLocalTodayIso(req.query.today);
    const todayRow = db
      .prepare(
        `
        SELECT
          COUNT(*) AS completed_sessions,
          COALESCE(SUM(actual_duration_sec), 0) AS total_focus_sec
        FROM focus_sessions
        WHERE user_id = ?
          AND mode IN ('focus', 'custom')
          AND status = 'completed'
          AND substr(started_at, 1, 10) = ?
      `
      )
      .get(req.user.id, today);

    const allFocusToday = db
      .prepare(
        `
        SELECT COALESCE(SUM(actual_duration_sec), 0) AS total_sec
        FROM focus_sessions
        WHERE user_id = ?
          AND mode IN ('focus', 'custom')
          AND substr(started_at, 1, 10) = ?
      `
      )
      .get(req.user.id, today);

    const totalRow = db
      .prepare(
        `
        SELECT
          COUNT(*) AS total_sessions,
          COALESCE(SUM(actual_duration_sec), 0) AS total_sec
        FROM focus_sessions
        WHERE user_id = ? AND mode IN ('focus', 'custom')
      `
      )
      .get(req.user.id);

    res.json({
      today_completed_sessions: Number(todayRow?.completed_sessions || 0),
      today_focus_sec: Number(allFocusToday?.total_sec || 0),
      total_sessions: Number(totalRow?.total_sessions || 0),
      total_focus_sec: Number(totalRow?.total_sec || 0),
    });
  });

  router.post('/sessions', (req, res) => {
    const mode = String(req.body?.mode || 'focus');
    const status = String(req.body?.status || 'completed');
    const planned = Number(req.body?.planned_duration_sec ?? req.body?.plannedDurationSec ?? 0);
    const actual = Number(req.body?.actual_duration_sec ?? req.body?.actualDurationSec ?? 0);
    const taskId = req.body?.task_id || req.body?.taskId || null;
    const startedAt = req.body?.started_at || req.body?.startedAt || new Date(Date.now() - actual * 1000).toISOString();
    const endedAt = req.body?.ended_at || req.body?.endedAt || new Date().toISOString();

    if (!VALID_MODES.has(mode)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Mode sesi fokus tidak valid.', 'mode');
    }
    if (!VALID_STATUSES.has(status)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Status sesi fokus tidak valid.', 'status');
    }
    if (!Number.isFinite(planned) || planned <= 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Durasi rencana tidak valid.');
    }
    if (!Number.isFinite(actual) || actual < 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Durasi aktual tidak valid.');
    }

    let validTaskId = null;
    let taskTitle = 'Fokus Umum';
    if (taskId) {
      const task = db.prepare('SELECT id, title FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
      if (task) {
        validTaskId = task.id;
        taskTitle = task.title;
      }
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO focus_sessions (
        id, user_id, task_id, mode, planned_duration_sec, actual_duration_sec, status, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, validTaskId, mode, Math.round(planned), Math.round(actual), status, startedAt, endedAt);

    if (mode === 'focus' || mode === 'custom') {
      logActivity(db, req.user.id, 'focus_session', id, 'focus_logged', {
        task_title: taskTitle,
        minutes: Math.max(1, Math.round(actual / 60)),
        status,
      });
    }

    const created = db
      .prepare(
        `
        SELECT fs.*, t.title AS task_title
        FROM focus_sessions fs
        LEFT JOIN tasks t ON t.id = fs.task_id
        WHERE fs.id = ?
      `
      )
      .get(id);

    res.status(201).json({
      session: {
        ...created,
        task_label: created.task_title || 'Fokus Umum',
      },
    });
  });

  return router;
}

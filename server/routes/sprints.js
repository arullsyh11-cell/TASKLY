import express from 'express';
import crypto from 'node:crypto';
import {
  dateRangeDays,
  getLocalTodayIso,
  logActivity,
  queryEnrichedTasks,
  sendError,
  withTransaction,
} from '../helpers.js';

const VALID_STATUSES = new Set(['planned', 'active', 'completed', 'archived']);

function computeSprintStats(db, userId, sprintId) {
  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN kc.semantic_type = 'done' THEN 1 ELSE 0 END) AS completed_tasks
      FROM tasks t
      JOIN kanban_columns kc ON kc.id = t.column_id
      WHERE t.user_id = ? AND t.sprint_id = ?
    `
    )
    .get(userId, sprintId);
  const total = Number(row?.total_tasks || 0);
  const completed = Number(row?.completed_tasks || 0);
  const remaining = Math.max(0, total - completed);
  const progress_percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total_tasks: total, completed_tasks: completed, remaining_tasks: remaining, progress_percent };
}

function computeBurndownSeries(db, userId, sprint, todayIso) {
  const days = dateRangeDays(sprint.start_date, sprint.end_date);
  if (days.length === 0) return [];

  const historyRows = db
    .prepare(
      `
      SELECT st.task_id, st.added_at, st.removed_at, t.completed_at, kc.semantic_type
      FROM sprint_tasks st
      JOIN tasks t ON t.id = st.task_id
      JOIN kanban_columns kc ON kc.id = t.column_id
      WHERE st.sprint_id = ? AND t.user_id = ?
    `
    )
    .all(sprint.id, userId);

  const currentCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE sprint_id = ? AND user_id = ?')
    .get(sprint.id, userId).cnt;

  const initialScope = Math.max(
    Number(currentCount || 0),
    historyRows.filter((r) => r.added_at.slice(0, 10) <= sprint.start_date).length
  );

  const denom = Math.max(1, days.length - 1);
  const effectiveToday = sprint.status === 'completed' || sprint.status === 'archived'
    ? (sprint.completed_at ? sprint.completed_at.slice(0, 10) : sprint.end_date)
    : todayIso;

  return days.map((d, idx) => {
    const ideal = days.length === 1
      ? 0
      : Number((initialScope * (1 - idx / denom)).toFixed(1));

    let actual = null;
    if (d <= effectiveToday) {
      let rem = 0;
      for (const item of historyRows) {
        const addedDay = item.added_at.slice(0, 10);
        const removedDay = item.removed_at ? item.removed_at.slice(0, 10) : null;
        const activeOnDay = addedDay <= d && (!removedDay || removedDay > d);
        if (!activeOnDay) continue;
        const completedDay = item.completed_at ? item.completed_at.slice(0, 10) : null;
        const isDoneOnDay = completedDay ? completedDay <= d : false;
        if (!isDoneOnDay) rem += 1;
      }
      actual = rem;
    }

    return {
      day: idx + 1,
      date: d,
      label: d.slice(5),
      ideal_remaining: ideal,
      actual_remaining: actual,
    };
  });
}

export function createSprintsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const sprints = db
      .prepare('SELECT * FROM sprints WHERE user_id = ? ORDER BY CASE status WHEN \'active\' THEN 0 WHEN \'planned\' THEN 1 WHEN \'completed\' THEN 2 ELSE 3 END, start_date DESC')
      .all(req.user.id);

    const enriched = sprints.map((sp) => ({
      ...sp,
      ...computeSprintStats(db, req.user.id, sp.id),
    }));
    res.json({ sprints: enriched });
  });

  router.get('/:id', (req, res) => {
    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!sprint) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');

    const today = getLocalTodayIso(req.query.today);
    const tasks = queryEnrichedTasks(
      db,
      req.user.id,
      'AND t.sprint_id = ?',
      [sprint.id],
      "CASE kc.semantic_type WHEN 'done' THEN 1 ELSE 0 END ASC, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, t.due_date ASC"
    );
    const stats = computeSprintStats(db, req.user.id, sprint.id);
    const burndown = computeBurndownSeries(db, req.user.id, sprint, today);

    res.json({
      sprint: { ...sprint, ...stats },
      tasks,
      burndown,
    });
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '');
    const goal = String(req.body?.goal || '');
    const startDate = String(req.body?.start_date || req.body?.startDate || '').trim();
    const endDate = String(req.body?.end_date || req.body?.endDate || '').trim();
    const status = req.body?.status && VALID_STATUSES.has(req.body.status) ? req.body.status : 'planned';

    if (!name || name.length > 100) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama sprint wajib diisi (maks. 100 karakter).', 'name');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tanggal mulai tidak valid.', 'start_date');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tanggal selesai tidak valid.', 'end_date');
    }
    if (endDate < startDate) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tanggal selesai harus sama atau setelah tanggal mulai.', 'end_date');
    }

    if (status === 'active') {
      const existingActive = db.prepare("SELECT id, name FROM sprints WHERE user_id = ? AND status = 'active'").get(req.user.id);
      if (existingActive) {
        return sendError(
          res,
          409,
          'ACTIVE_SPRINT_EXISTS',
          `Sprint "${existingActive.name}" masih aktif. Selesaikan sprint aktif terlebih dahulu atau buat sebagai Planned.`
        );
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const taskIds = Array.isArray(req.body?.taskIds) ? [...new Set(req.body.taskIds)] : [];

    withTransaction(db, () => {
      db.prepare(`
        INSERT INTO sprints (id, user_id, name, description, goal, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.user.id, name, description, goal, startDate, endDate, status, now, now);

      for (const tid of taskIds) {
        const owned = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(tid, req.user.id);
        if (owned) {
          db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE task_id = ? AND removed_at IS NULL').run(now, tid);
          db.prepare('UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?').run(id, now, tid);
          db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
            crypto.randomUUID(),
            id,
            tid,
            now
          );
        }
      }

      logActivity(db, req.user.id, 'sprint', id, 'sprint_created', { name, status });
    });

    const created = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
    res.status(201).json({ sprint: { ...created, ...computeSprintStats(db, req.user.id, id) } });
  });

  router.patch('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const description = req.body?.description !== undefined ? String(req.body.description) : existing.description;
    const goal = req.body?.goal !== undefined ? String(req.body.goal) : existing.goal;
    const startDate = req.body?.start_date || req.body?.startDate || existing.start_date;
    const endDate = req.body?.end_date || req.body?.endDate || existing.end_date;
    const status = req.body?.status && VALID_STATUSES.has(req.body.status) ? req.body.status : existing.status;

    if (!name || name.length > 100) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama sprint wajib diisi.', 'name');
    }
    if (endDate < startDate) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tanggal selesai harus sama atau setelah tanggal mulai.', 'end_date');
    }

    if (status === 'active' && existing.status !== 'active') {
      const otherActive = db
        .prepare("SELECT id, name FROM sprints WHERE user_id = ? AND status = 'active' AND id != ?")
        .get(req.user.id, existing.id);
      if (otherActive) {
        return sendError(
          res,
          409,
          'ACTIVE_SPRINT_EXISTS',
          `Sprint "${otherActive.name}" masih aktif. Selesaikan sprint tersebut terlebih dahulu.`
        );
      }
    }

    const now = new Date().toISOString();
    const completedAt = status === 'completed' && !existing.completed_at ? now : existing.completed_at;
    db.prepare(`
      UPDATE sprints
      SET name = ?, description = ?, goal = ?, start_date = ?, end_date = ?, status = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(name, description, goal, startDate, endDate, status, completedAt, now, existing.id, req.user.id);

    const updated = db.prepare('SELECT * FROM sprints WHERE id = ?').get(existing.id);
    res.json({ sprint: { ...updated, ...computeSprintStats(db, req.user.id, existing.id) } });
  });

  router.post('/:id/start', (req, res) => {
    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!sprint) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');
    if (sprint.status === 'active') {
      return res.json({ sprint: { ...sprint, ...computeSprintStats(db, req.user.id, sprint.id) } });
    }

    const active = db
      .prepare("SELECT * FROM sprints WHERE user_id = ? AND status = 'active' AND id != ?")
      .get(req.user.id, sprint.id);

    if (active && !req.body?.forceCompleteActive) {
      return res.status(409).json({
        error: {
          code: 'ACTIVE_SPRINT_EXISTS',
          message: `Sprint "${active.name}" masih berjalan. Selesaikan sprint aktif tersebut untuk memulai "${sprint.name}".`,
          activeSprint: active,
          retryable: false,
        },
      });
    }

    const now = new Date().toISOString();
    withTransaction(db, () => {
      if (active) {
        db.prepare("UPDATE sprints SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
          now,
          now,
          active.id
        );
        db.prepare('UPDATE tasks SET sprint_id = NULL, updated_at = ? WHERE sprint_id = ? AND completed_at IS NULL').run(
          now,
          active.id
        );
        logActivity(db, req.user.id, 'sprint', active.id, 'sprint_completed', { name: active.name });
      }
      db.prepare("UPDATE sprints SET status = 'active', updated_at = ? WHERE id = ?").run(now, sprint.id);
      logActivity(db, req.user.id, 'sprint', sprint.id, 'sprint_started', { name: sprint.name });
    });

    const updated = db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprint.id);
    res.json({ sprint: { ...updated, ...computeSprintStats(db, req.user.id, sprint.id) } });
  });

  router.post('/:id/complete', (req, res) => {
    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!sprint) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');

    const carryoverAction = req.body?.carryoverAction === 'sprint' ? 'sprint' : 'backlog';
    const targetSprintId = req.body?.targetSprintId || null;

    if (carryoverAction === 'sprint') {
      if (!targetSprintId || targetSprintId === sprint.id) {
        return sendError(res, 400, 'INVALID_TARGET_SPRINT', 'Pilih sprint tujuan yang valid.', 'targetSprintId');
      }
      const target = db
        .prepare("SELECT id FROM sprints WHERE id = ? AND user_id = ? AND status IN ('planned', 'active')")
        .get(targetSprintId, req.user.id);
      if (!target) {
        return sendError(res, 400, 'INVALID_TARGET_SPRINT', 'Sprint tujuan harus berstatus Planned atau Active.', 'targetSprintId');
      }
    }

    const now = new Date().toISOString();
    withTransaction(db, () => {
      const remainingTasks = db
        .prepare(
          `
          SELECT t.id
          FROM tasks t
          JOIN kanban_columns kc ON kc.id = t.column_id
          WHERE t.user_id = ? AND t.sprint_id = ? AND kc.semantic_type != 'done'
        `
        )
        .all(req.user.id, sprint.id);

      for (const task of remainingTasks) {
        db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE sprint_id = ? AND task_id = ? AND removed_at IS NULL').run(
          now,
          sprint.id,
          task.id
        );
        if (carryoverAction === 'sprint' && targetSprintId) {
          db.prepare('UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?').run(targetSprintId, now, task.id);
          db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
            crypto.randomUUID(),
            targetSprintId,
            task.id,
            now
          );
        } else {
          db.prepare('UPDATE tasks SET sprint_id = NULL, updated_at = ? WHERE id = ?').run(now, task.id);
        }
      }

      db.prepare("UPDATE sprints SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
        now,
        now,
        sprint.id
      );
      logActivity(db, req.user.id, 'sprint', sprint.id, 'sprint_completed', { name: sprint.name });
    });

    const updated = db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprint.id);
    res.json({ sprint: { ...updated, ...computeSprintStats(db, req.user.id, sprint.id) } });
  });

  router.post('/:id/tasks', (req, res) => {
    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!sprint) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');

    const taskId = req.body?.taskId;
    const action = req.body?.action === 'remove' ? 'remove' : 'add';
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
    if (!task) return sendError(res, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');

    const now = new Date().toISOString();
    withTransaction(db, () => {
      if (action === 'remove') {
        db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE sprint_id = ? AND task_id = ? AND removed_at IS NULL').run(
          now,
          sprint.id,
          task.id
        );
        db.prepare('UPDATE tasks SET sprint_id = NULL, updated_at = ? WHERE id = ?').run(now, task.id);
      } else {
        db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE task_id = ? AND removed_at IS NULL').run(now, task.id);
        db.prepare('UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?').run(sprint.id, now, task.id);
        db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
          crypto.randomUUID(),
          sprint.id,
          task.id,
          now
        );
      }
    });

    res.json({ ok: true, stats: computeSprintStats(db, req.user.id, sprint.id) });
  });

  router.delete('/:id', (req, res) => {
    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!sprint) return sendError(res, 404, 'NOT_FOUND', 'Sprint tidak ditemukan.');

    const now = new Date().toISOString();
    withTransaction(db, () => {
      db.prepare('UPDATE tasks SET sprint_id = NULL, updated_at = ? WHERE sprint_id = ? AND user_id = ?').run(
        now,
        sprint.id,
        req.user.id
      );
      db.prepare('DELETE FROM sprints WHERE id = ? AND user_id = ?').run(sprint.id, req.user.id);
      logActivity(db, req.user.id, 'sprint', sprint.id, 'sprint_deleted', { name: sprint.name });
    });

    res.json({ deletedId: sprint.id });
  });

  return router;
}

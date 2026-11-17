import express from 'express';
import crypto from 'node:crypto';
import {
  addDaysIso,
  getLocalTodayIso,
  logActivity,
  queryEnrichedTasks,
  sendError,
  withTransaction,
} from '../helpers.js';

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

function normalizeDate(val) {
  if (val === undefined || val === null || val === '') return null;
  const s = String(val).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

export function createTasksRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const today = getLocalTodayIso(req.query.today);
    const clauses = [];
    const params = [];

    if (req.query.search) {
      const q = `%${String(req.query.search).trim().toLowerCase()}%`;
      clauses.push(
        '(LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ? OR EXISTS (SELECT 1 FROM task_label_assignments tla JOIN task_labels tl ON tl.id = tla.label_id WHERE tla.task_id = t.id AND LOWER(tl.name) LIKE ?))'
      );
      params.push(q, q, q);
    }
    if (req.query.columnId) {
      clauses.push('t.column_id = ?');
      params.push(req.query.columnId);
    }
    if (req.query.semanticType) {
      clauses.push('kc.semantic_type = ?');
      params.push(req.query.semanticType);
    }
    if (req.query.priority && VALID_PRIORITIES.has(req.query.priority)) {
      clauses.push('t.priority = ?');
      params.push(req.query.priority);
    }
    if (req.query.categoryId) {
      clauses.push('t.category_id = ?');
      params.push(req.query.categoryId);
    }
    if (req.query.sprintId === 'backlog') {
      clauses.push('t.sprint_id IS NULL');
    } else if (req.query.sprintId) {
      clauses.push('t.sprint_id = ?');
      params.push(req.query.sprintId);
    }

    if (req.query.deadline === 'overdue') {
      clauses.push("t.due_date IS NOT NULL AND t.due_date < ? AND kc.semantic_type != 'done'");
      params.push(today);
    } else if (req.query.deadline === 'today') {
      clauses.push('t.due_date = ?');
      params.push(today);
    } else if (req.query.deadline === 'week') {
      clauses.push('t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?');
      params.push(today, addDaysIso(today, 7));
    } else if (req.query.deadline === 'none') {
      clauses.push('t.due_date IS NULL');
    }

    let orderSql = 't.position_in_column ASC, t.created_at DESC';
    if (req.query.sort === 'due_date') {
      orderSql = 'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC, t.created_at DESC';
    } else if (req.query.sort === 'priority') {
      orderSql =
        "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, t.due_date ASC";
    } else if (req.query.sort === 'updated_at') {
      orderSql = 't.updated_at DESC';
    }

    const whereSql = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
    const tasks = queryEnrichedTasks(db, req.user.id, whereSql, params, orderSql);
    res.json({ tasks });
  });

  router.get('/:id', (req, res) => {
    const tasks = queryEnrichedTasks(db, req.user.id, 'AND t.id = ?', [req.params.id]);
    if (tasks.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
    }
    res.json({ task: tasks[0] });
  });

  router.post('/', (req, res) => {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '');
    const priority = req.body?.priority ? String(req.body.priority) : 'medium';
    const startDate = normalizeDate(req.body?.start_date ?? req.body?.startDate);
    const dueDate = normalizeDate(req.body?.due_date ?? req.body?.dueDate);

    if (!title || title.length > 160) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Judul tugas wajib diisi (maks. 160 karakter).', 'title');
    }
    if (!VALID_PRIORITIES.has(priority)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Prioritas tugas tidak valid.', 'priority');
    }
    if (startDate === undefined) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Format tanggal mulai tidak valid (YYYY-MM-DD).', 'start_date');
    }
    if (dueDate === undefined) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Format tenggat waktu tidak valid (YYYY-MM-DD).', 'due_date');
    }
    if (startDate && dueDate && dueDate < startDate) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Tanggal mulai tidak boleh melewati tenggat waktu.',
        'due_date'
      );
    }

    let columnId = req.body?.column_id || req.body?.columnId;
    let column;
    if (columnId) {
      column = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(columnId, req.user.id);
    } else {
      column = db
        .prepare("SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY CASE WHEN semantic_type = 'todo' THEN 0 ELSE 1 END, position ASC LIMIT 1")
        .get(req.user.id);
    }
    if (!column) {
      return sendError(res, 400, 'INVALID_COLUMN', 'Kolom Kanban tidak ditemukan.', 'column_id');
    }
    columnId = column.id;

    const categoryId = req.body?.category_id || req.body?.categoryId || null;
    if (categoryId) {
      const cat = db.prepare('SELECT id FROM task_categories WHERE id = ? AND user_id = ?').get(categoryId, req.user.id);
      if (!cat) return sendError(res, 400, 'INVALID_CATEGORY', 'Kategori tidak ditemukan.', 'category_id');
    }

    const sprintId = req.body?.sprint_id || req.body?.sprintId || null;
    if (sprintId) {
      const sp = db.prepare('SELECT id FROM sprints WHERE id = ? AND user_id = ?').get(sprintId, req.user.id);
      if (!sp) return sendError(res, 400, 'INVALID_SPRINT', 'Sprint tidak ditemukan.', 'sprint_id');
    }

    const labelIds = Array.isArray(req.body?.label_ids || req.body?.labelIds)
      ? [...new Set(req.body.label_ids || req.body.labelIds)]
      : [];
    if (labelIds.length > 0) {
      const ph = labelIds.map(() => '?').join(',');
      const validLabels = db
        .prepare(`SELECT id FROM task_labels WHERE user_id = ? AND id IN (${ph})`)
        .all(req.user.id, ...labelIds);
      if (validLabels.length !== labelIds.length) {
        return sendError(res, 400, 'INVALID_LABEL', 'Terdapat label yang tidak valid.');
      }
    }

    const subtasksInput = Array.isArray(req.body?.subtasks) ? req.body.subtasks : [];
    const maxPosRow = db
      .prepare('SELECT COALESCE(MAX(position_in_column), 0) AS max_pos FROM tasks WHERE user_id = ? AND column_id = ?')
      .get(req.user.id, columnId);
    const position =
      typeof req.body?.position_in_column === 'number'
        ? req.body.position_in_column
        : Number(maxPosRow.max_pos) + 1000;

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();
    const completedAt = column.semantic_type === 'done' ? now : null;

    withTransaction(db, () => {
      db.prepare(`
        INSERT INTO tasks (
          id, user_id, column_id, category_id, sprint_id, assignee_id,
          title, description, priority, start_date, due_date,
          position_in_column, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        req.user.id,
        columnId,
        categoryId,
        sprintId,
        req.user.id,
        title,
        description,
        priority,
        startDate,
        dueDate,
        position,
        completedAt,
        now,
        now
      );

      for (const lid of labelIds) {
        db.prepare('INSERT INTO task_label_assignments (task_id, label_id) VALUES (?, ?)').run(taskId, lid);
      }

      subtasksInput.forEach((st, idx) => {
        const stTitle = String(st?.title || '').trim();
        if (stTitle) {
          db.prepare(
            'INSERT INTO subtasks (id, task_id, title, is_completed, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), taskId, stTitle, st?.is_completed ? 1 : 0, idx, now);
        }
      });

      if (sprintId) {
        db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
          crypto.randomUUID(),
          sprintId,
          taskId,
          now
        );
      }

      logActivity(db, req.user.id, 'task', taskId, 'task_created', { title, column_name: column.name });
    });

    const [created] = queryEnrichedTasks(db, req.user.id, 'AND t.id = ?', [taskId]);
    res.status(201).json({ task: created });
  });

  router.patch('/bulk', (req, res) => {
    const taskIds = Array.isArray(req.body?.taskIds) ? [...new Set(req.body.taskIds)] : [];
    const action = req.body?.action;
    if (taskIds.length === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Pilih minimal satu tugas.');
    }

    const ph = taskIds.map(() => '?').join(',');
    const owned = db
      .prepare(`SELECT id FROM tasks WHERE user_id = ? AND id IN (${ph})`)
      .all(req.user.id, ...taskIds);
    if (owned.length !== taskIds.length) {
      return sendError(res, 404, 'NOT_FOUND', 'Sebagian tugas tidak ditemukan.');
    }

    const now = new Date().toISOString();

    if (action === 'delete') {
      db.prepare(`DELETE FROM tasks WHERE user_id = ? AND id IN (${ph})`).run(req.user.id, ...taskIds);
      return res.json({ updatedCount: taskIds.length });
    }

    if (action === 'move_column') {
      const col = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(req.body?.columnId, req.user.id);
      if (!col) return sendError(res, 400, 'INVALID_COLUMN', 'Kolom tujuan tidak valid.');
      if (col.semantic_type === 'done') {
        db.prepare(
          `UPDATE tasks SET column_id = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE user_id = ? AND id IN (${ph})`
        ).run(col.id, now, now, req.user.id, ...taskIds);
      } else {
        db.prepare(
          `UPDATE tasks SET column_id = ?, completed_at = NULL, updated_at = ? WHERE user_id = ? AND id IN (${ph})`
        ).run(col.id, now, req.user.id, ...taskIds);
      }
      return res.json({ updatedCount: taskIds.length });
    }

    if (action === 'set_priority') {
      if (!VALID_PRIORITIES.has(req.body?.priority)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Prioritas tidak valid.');
      }
      db.prepare(`UPDATE tasks SET priority = ?, updated_at = ? WHERE user_id = ? AND id IN (${ph})`).run(
        req.body.priority,
        now,
        req.user.id,
        ...taskIds
      );
      return res.json({ updatedCount: taskIds.length });
    }

    if (action === 'assign_sprint') {
      const sprintId = req.body?.sprintId || null;
      if (sprintId) {
        const sp = db.prepare('SELECT id FROM sprints WHERE id = ? AND user_id = ?').get(sprintId, req.user.id);
        if (!sp) return sendError(res, 400, 'INVALID_SPRINT', 'Sprint tujuan tidak valid.');
      }
      withTransaction(db, () => {
        for (const tid of taskIds) {
          db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE task_id = ? AND removed_at IS NULL').run(now, tid);
          db.prepare('UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
            sprintId,
            now,
            tid,
            req.user.id
          );
          if (sprintId) {
            db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
              crypto.randomUUID(),
              sprintId,
              tid,
              now
            );
          }
        }
      });
      return res.json({ updatedCount: taskIds.length });
    }

    return sendError(res, 400, 'VALIDATION_ERROR', 'Aksi massal tidak dikenali.');
  });

  router.patch('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    if (!title || title.length > 160) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Judul tugas wajib diisi (maks. 160 karakter).', 'title');
    }

    const description = req.body?.description !== undefined ? String(req.body.description) : existing.description;
    const priority = req.body?.priority !== undefined ? String(req.body.priority) : existing.priority;
    if (!VALID_PRIORITIES.has(priority)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Prioritas tugas tidak valid.', 'priority');
    }

    const startDate =
      req.body?.start_date !== undefined || req.body?.startDate !== undefined
        ? normalizeDate(req.body.start_date ?? req.body.startDate)
        : existing.start_date;
    const dueDate =
      req.body?.due_date !== undefined || req.body?.dueDate !== undefined
        ? normalizeDate(req.body.due_date ?? req.body.dueDate)
        : existing.due_date;

    if (startDate === undefined || dueDate === undefined) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Format tanggal tidak valid (YYYY-MM-DD).');
    }
    if (startDate && dueDate && dueDate < startDate) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Tanggal mulai tidak boleh melewati tenggat waktu.',
        'due_date'
      );
    }

    const nextColumnId = req.body?.column_id || req.body?.columnId || existing.column_id;
    const nextCol = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(nextColumnId, req.user.id);
    if (!nextCol) return sendError(res, 400, 'INVALID_COLUMN', 'Kolom tujuan tidak ditemukan.', 'column_id');

    const prevCol = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(existing.column_id, req.user.id);

    const categoryId =
      req.body?.category_id !== undefined || req.body?.categoryId !== undefined
        ? req.body.category_id ?? req.body.categoryId ?? null
        : existing.category_id;
    if (categoryId) {
      const cat = db.prepare('SELECT id FROM task_categories WHERE id = ? AND user_id = ?').get(categoryId, req.user.id);
      if (!cat) return sendError(res, 400, 'INVALID_CATEGORY', 'Kategori tidak ditemukan.');
    }

    const sprintId =
      req.body?.sprint_id !== undefined || req.body?.sprintId !== undefined
        ? req.body.sprint_id ?? req.body.sprintId ?? null
        : existing.sprint_id;
    if (sprintId) {
      const sp = db.prepare('SELECT id FROM sprints WHERE id = ? AND user_id = ?').get(sprintId, req.user.id);
      if (!sp) return sendError(res, 400, 'INVALID_SPRINT', 'Sprint tidak ditemukan.');
    }

    const positionInColumn =
      typeof req.body?.position_in_column === 'number'
        ? req.body.position_in_column
        : existing.position_in_column;

    const now = new Date().toISOString();
    let completedAt = existing.completed_at;
    if (nextCol.semantic_type === 'done' && prevCol?.semantic_type !== 'done') {
      completedAt = now;
    } else if (nextCol.semantic_type !== 'done' && prevCol?.semantic_type === 'done') {
      completedAt = null;
    }

    const labelIdsInput =
      req.body?.label_ids !== undefined || req.body?.labelIds !== undefined
        ? [...new Set(req.body.label_ids || req.body.labelIds || [])]
        : null;
    if (labelIdsInput && labelIdsInput.length > 0) {
      const ph = labelIdsInput.map(() => '?').join(',');
      const validLabels = db
        .prepare(`SELECT id FROM task_labels WHERE user_id = ? AND id IN (${ph})`)
        .all(req.user.id, ...labelIdsInput);
      if (validLabels.length !== labelIdsInput.length) {
        return sendError(res, 400, 'INVALID_LABEL', 'Terdapat label yang tidak valid.');
      }
    }

    withTransaction(db, () => {
      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, priority = ?, column_id = ?, category_id = ?, sprint_id = ?,
            start_date = ?, due_date = ?, position_in_column = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        title,
        description,
        priority,
        nextColumnId,
        categoryId,
        sprintId,
        startDate,
        dueDate,
        positionInColumn,
        completedAt,
        now,
        existing.id,
        req.user.id
      );

      if (labelIdsInput !== null) {
        db.prepare('DELETE FROM task_label_assignments WHERE task_id = ?').run(existing.id);
        for (const lid of labelIdsInput) {
          db.prepare('INSERT INTO task_label_assignments (task_id, label_id) VALUES (?, ?)').run(existing.id, lid);
        }
      }

      if (sprintId !== existing.sprint_id) {
        db.prepare('UPDATE sprint_tasks SET removed_at = ? WHERE task_id = ? AND removed_at IS NULL').run(now, existing.id);
        if (sprintId) {
          db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
            crypto.randomUUID(),
            sprintId,
            existing.id,
            now
          );
        }
      }

      if (nextColumnId !== existing.column_id) {
        const action = nextCol.semantic_type === 'done' ? 'task_completed' : 'task_moved';
        logActivity(db, req.user.id, 'task', existing.id, action, {
          title,
          from_column: prevCol?.name || '',
          to_column: nextCol.name,
        });
      }
    });

    const [updated] = queryEnrichedTasks(db, req.user.id, 'AND t.id = ?', [existing.id]);
    res.json({ task: updated });
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT id, title FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
    logActivity(db, req.user.id, 'task', existing.id, 'task_deleted', { title: existing.title });
    res.json({ deletedId: existing.id });
  });

  // Subtasks
  router.post('/:id/subtasks', (req, res) => {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!task) return sendError(res, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
    const title = String(req.body?.title || '').trim();
    if (!title || title.length > 160) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Judul subtask wajib diisi (maks. 160 karakter).', 'title');
    }
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS mp FROM subtasks WHERE task_id = ?').get(task.id);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO subtasks (id, task_id, title, is_completed, position, created_at) VALUES (?, ?, ?, 0, ?, ?)').run(
      id,
      task.id,
      title,
      Number(maxPos.mp) + 1,
      now
    );
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, task.id);
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
    res.status(201).json({ subtask: { ...subtask, is_completed: Boolean(subtask.is_completed) } });
  });

  router.patch('/:id/subtasks/:subtaskId', (req, res) => {
    const sub = db
      .prepare('SELECT s.* FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ? AND s.task_id = ? AND t.user_id = ?')
      .get(req.params.subtaskId, req.params.id, req.user.id);
    if (!sub) return sendError(res, 404, 'NOT_FOUND', 'Subtask tidak ditemukan.');

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : sub.title;
    if (!title) return sendError(res, 400, 'VALIDATION_ERROR', 'Judul subtask tidak boleh kosong.');
    const isCompleted =
      req.body?.is_completed !== undefined || req.body?.isCompleted !== undefined
        ? req.body.is_completed ?? req.body.isCompleted
          ? 1
          : 0
        : sub.is_completed;
    const now = new Date().toISOString();
    db.prepare('UPDATE subtasks SET title = ?, is_completed = ? WHERE id = ?').run(title, isCompleted, sub.id);
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, sub.task_id);
    const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sub.id);
    res.json({ subtask: { ...updated, is_completed: Boolean(updated.is_completed) } });
  });

  router.delete('/:id/subtasks/:subtaskId', (req, res) => {
    const sub = db
      .prepare('SELECT s.id, s.task_id FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ? AND s.task_id = ? AND t.user_id = ?')
      .get(req.params.subtaskId, req.params.id, req.user.id);
    if (!sub) return sendError(res, 404, 'NOT_FOUND', 'Subtask tidak ditemukan.');
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(sub.id);
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), sub.task_id);
    res.json({ deletedId: sub.id });
  });

  return router;
}

import express from 'express';
import crypto from 'node:crypto';
import { logActivity, sendError, withTransaction } from '../helpers.js';

const VALID_SEMANTICS = new Set(['backlog', 'todo', 'in_progress', 'review', 'done']);

export function createColumnsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const columns = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.column_id = c.id AND t.user_id = c.user_id) AS task_count
      FROM kanban_columns c
      WHERE c.user_id = ?
      ORDER BY c.position ASC, c.created_at ASC
    `).all(req.user.id);
    res.json({ columns: columns.map((c) => ({ ...c, is_default: Boolean(c.is_default) })) });
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const semanticType = String(req.body?.semantic_type || req.body?.semanticType || 'todo');
    if (!name || name.length > 40) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama kolom wajib diisi (maks. 40 karakter).', 'name');
    }
    if (!VALID_SEMANTICS.has(semanticType)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tipe semantik kolom tidak valid.', 'semantic_type');
    }

    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS max_pos FROM kanban_columns WHERE user_id = ?').get(req.user.id);
    const colId = crypto.randomUUID();
    const now = new Date().toISOString();
    const position = Number(maxPos.max_pos) + 1;

    db.prepare(`
      INSERT INTO kanban_columns (id, user_id, name, semantic_type, position, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(colId, req.user.id, name, semanticType, position, now);

    logActivity(db, req.user.id, 'column', colId, 'column_created', { name, semantic_type: semanticType });
    const created = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(colId);
    res.status(201).json({ column: { ...created, is_default: Boolean(created.is_default), task_count: 0 } });
  });

  router.patch('/reorder', (req, res) => {
    const columnIds = req.body?.columnIds;
    if (!Array.isArray(columnIds) || columnIds.length === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Daftar columnIds tidak valid.');
    }
    const existing = db.prepare('SELECT id FROM kanban_columns WHERE user_id = ?').all(req.user.id);
    const existingIds = new Set(existing.map((c) => c.id));
    if (!columnIds.every((id) => existingIds.has(id))) {
      return sendError(res, 400, 'INVALID_COLUMN', 'Terdapat kolom yang tidak ditemukan.');
    }

    withTransaction(db, () => {
      const stmt = db.prepare('UPDATE kanban_columns SET position = ? WHERE id = ? AND user_id = ?');
      columnIds.forEach((id, index) => {
        stmt.run(index, id, req.user.id);
      });
    });

    const columns = db.prepare('SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position ASC').all(req.user.id);
    res.json({ columns: columns.map((c) => ({ ...c, is_default: Boolean(c.is_default) })) });
  });

  router.patch('/:id', (req, res) => {
    const col = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!col) {
      return sendError(res, 404, 'NOT_FOUND', 'Kolom tidak ditemukan.');
    }
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : col.name;
    const semanticType = req.body?.semantic_type || req.body?.semanticType || col.semantic_type;
    if (!name || name.length > 40) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama kolom wajib diisi (maks. 40 karakter).', 'name');
    }
    if (!VALID_SEMANTICS.has(semanticType)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tipe semantik kolom tidak valid.', 'semantic_type');
    }

    db.prepare('UPDATE kanban_columns SET name = ?, semantic_type = ? WHERE id = ? AND user_id = ?').run(
      name,
      semanticType,
      col.id,
      req.user.id
    );
    const updated = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(col.id);
    res.json({ column: { ...updated, is_default: Boolean(updated.is_default) } });
  });

  router.delete('/:id', (req, res) => {
    const col = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!col) {
      return sendError(res, 404, 'NOT_FOUND', 'Kolom tidak ditemukan.');
    }

    const allCols = db.prepare('SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position ASC').all(req.user.id);
    if (allCols.length <= 2) {
      return sendError(res, 400, 'MIN_COLUMNS_REQUIRED', 'Workspace minimal harus memiliki 2 kolom alur kerja.');
    }

    if (col.semantic_type === 'done') {
      const doneCols = allCols.filter((c) => c.semantic_type === 'done');
      if (doneCols.length <= 1) {
        return sendError(res, 400, 'DONE_COLUMN_REQUIRED', 'Minimal harus ada 1 kolom bertipe selesai (Done) untuk pelacakan progres.');
      }
    } else {
      const activeCols = allCols.filter((c) => c.semantic_type !== 'done');
      if (activeCols.length <= 1) {
        return sendError(res, 400, 'ACTIVE_COLUMN_REQUIRED', 'Minimal harus ada 1 kolom aktif selain Done.');
      }
    }

    const taskCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE column_id = ? AND user_id = ?').get(col.id, req.user.id);
    const targetColumnId = req.body?.targetColumnId || req.query?.targetColumnId;

    if (taskCountRow.cnt > 0) {
      if (!targetColumnId || targetColumnId === col.id) {
        return sendError(
          res,
          400,
          'TARGET_COLUMN_REQUIRED',
          'Kolom masih memiliki tugas. Pilih kolom tujuan untuk memindahkan tugas terlebih dahulu.',
          'targetColumnId'
        );
      }
      const targetCol = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?').get(targetColumnId, req.user.id);
      if (!targetCol) {
        return sendError(res, 400, 'INVALID_TARGET_COLUMN', 'Kolom tujuan migrasi tidak ditemukan.', 'targetColumnId');
      }

      withTransaction(db, () => {
        const now = new Date().toISOString();
        if (targetCol.semantic_type === 'done') {
          db.prepare('UPDATE tasks SET column_id = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE column_id = ? AND user_id = ?')
            .run(targetCol.id, now, now, col.id, req.user.id);
        } else {
          db.prepare('UPDATE tasks SET column_id = ?, completed_at = NULL, updated_at = ? WHERE column_id = ? AND user_id = ?')
            .run(targetCol.id, now, col.id, req.user.id);
        }
        db.prepare('DELETE FROM kanban_columns WHERE id = ? AND user_id = ?').run(col.id, req.user.id);
      });
    } else {
      db.prepare('DELETE FROM kanban_columns WHERE id = ? AND user_id = ?').run(col.id, req.user.id);
    }

    res.json({ deletedId: col.id, migratedCount: taskCountRow.cnt });
  });

  return router;
}

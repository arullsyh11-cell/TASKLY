import express from 'express';
import crypto from 'node:crypto';
import { sendError } from '../helpers.js';

const ALLOWED_TOKENS = new Set(['accent', 'secondary', 'success', 'warning', 'danger', 'neutral']);

export function createTaxonomyRouter(db) {
  const router = express.Router();

  // Categories
  router.get('/categories', (req, res) => {
    const categories = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM tasks t WHERE t.category_id = c.id AND t.user_id = c.user_id) AS task_count
      FROM task_categories c
      WHERE c.user_id = ?
      ORDER BY c.name ASC
    `).all(req.user.id);
    res.json({ categories });
  });

  router.post('/categories', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const colorToken = ALLOWED_TOKENS.has(req.body?.color_token) ? req.body.color_token : 'accent';
    if (!name || name.length > 32) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama kategori wajib diisi (maks. 32 karakter).', 'name');
    }
    const existing = db.prepare('SELECT id FROM task_categories WHERE user_id = ? AND LOWER(name) = LOWER(?)').get(req.user.id, name);
    if (existing) {
      return sendError(res, 409, 'DUPLICATE_NAME', 'Kategori dengan nama tersebut sudah ada.', 'name');
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO task_categories (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.user.id,
      name,
      colorToken,
      now
    );
    const category = db.prepare('SELECT * FROM task_categories WHERE id = ?').get(id);
    res.status(201).json({ category: { ...category, task_count: 0 } });
  });

  router.patch('/categories/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM task_categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Kategori tidak ditemukan.');
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const colorToken = ALLOWED_TOKENS.has(req.body?.color_token) ? req.body.color_token : existing.color_token;
    if (!name || name.length > 32) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama kategori wajib diisi (maks. 32 karakter).', 'name');
    }
    db.prepare('UPDATE task_categories SET name = ?, color_token = ? WHERE id = ? AND user_id = ?').run(
      name,
      colorToken,
      existing.id,
      req.user.id
    );
    const category = db.prepare('SELECT * FROM task_categories WHERE id = ?').get(existing.id);
    res.json({ category });
  });

  router.delete('/categories/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM task_categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Kategori tidak ditemukan.');
    db.prepare('DELETE FROM task_categories WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
    res.json({ deletedId: existing.id });
  });

  // Labels
  router.get('/labels', (req, res) => {
    const labels = db.prepare('SELECT * FROM task_labels WHERE user_id = ? ORDER BY name ASC').all(req.user.id);
    res.json({ labels });
  });

  router.post('/labels', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const colorToken = ALLOWED_TOKENS.has(req.body?.color_token) ? req.body.color_token : 'secondary';
    if (!name || name.length > 24) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Nama label wajib diisi (maks. 24 karakter).', 'name');
    }
    const existing = db.prepare('SELECT id FROM task_labels WHERE user_id = ? AND LOWER(name) = LOWER(?)').get(req.user.id, name);
    if (existing) {
      return sendError(res, 409, 'DUPLICATE_NAME', 'Label dengan nama tersebut sudah ada.', 'name');
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO task_labels (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.user.id,
      name,
      colorToken,
      now
    );
    const label = db.prepare('SELECT * FROM task_labels WHERE id = ?').get(id);
    res.status(201).json({ label });
  });

  router.delete('/labels/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM task_labels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Label tidak ditemukan.');
    db.prepare('DELETE FROM task_labels WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
    res.json({ deletedId: existing.id });
  });

  return router;
}

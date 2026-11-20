import express from 'express';
import crypto from 'node:crypto';
import { bootstrapUserDefaults } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { sendError } from '../helpers.js';

export function createAuthRouter(db, secret, requireAuth) {
  const router = express.Router();
  const resetCodes = new Map();

  router.post('/register', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || req.body?.full_name || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid email address.', 'email');
    }
    if (!fullName || fullName.length < 2) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Full name must be at least 2 characters.', 'fullName');
    }
    if (password.length < 8) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.', 'password');
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return sendError(res, 409, 'EMAIL_EXISTS', 'That email address is already registered.', 'email');
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, email, passwordHash, fullName, now, now);
      bootstrapUserDefaults(db, userId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const user = { id: userId, email, full_name: fullName, avatar_url: null, created_at: now };
    const token = signToken({ sub: userId, email }, secret);
    res.status(201).json({ token, user });
  });

  router.post('/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Email and password are required.');
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password does not match.');
    }

    bootstrapUserDefaults(db, row.id);
    const token = signToken({ sub: row.id, email: row.email }, secret);
    const user = {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
    };
    res.json({ token, user });
  });

  router.post('/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Enter a valid email address.', 'email');
    }
    const row = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (!row) {
      return res.json({
        message: 'If this email is registered, a local recovery code has been generated.',
      });
    }
    const code = String(crypto.randomInt(100000, 999999));
    resetCodes.set(email, { code, expiresAt: Date.now() + 15 * 60 * 1000 });
    res.json({
      message: 'Local recovery code is active for 15 minutes (local environment without SMTP).',
      localResetCode: code,
    });
  });

  router.post('/reset-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const record = resetCodes.get(email);
    if (!record || record.code !== code || record.expiresAt < Date.now()) {
      return sendError(res, 400, 'INVALID_RESET_CODE', 'Recovery code is invalid or expired.', 'code');
    }
    if (newPassword.length < 8) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'New password must be at least 8 characters.', 'newPassword');
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      email
    );
    resetCodes.delete(email);
    res.json({ message: 'Password updated successfully. Please sign in again.' });
  });

  router.get('/me', requireAuth, (req, res) => {
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    res.json({
      user: req.user,
      settings: settings
        ? { ...settings, sound_enabled: Boolean(settings.sound_enabled) }
        : null,
    });
  });

  router.patch('/profile', requireAuth, (req, res) => {
    const fullName = String(req.body?.fullName || req.body?.full_name || '').trim();
    if (!fullName || fullName.length < 2) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Full name must be at least 2 characters.', 'fullName');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(fullName, now, req.user.id);
    const updated = db.prepare('SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: updated });
  });

  router.post('/change-password', requireAuth, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'New password must be at least 8 characters.', 'newPassword');
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return sendError(res, 400, 'INVALID_PASSWORD', 'Current password is incorrect.', 'currentPassword');
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      req.user.id
    );
    res.json({ message: 'Password updated successfully.' });
  });

  router.delete('/account', requireAuth, (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ message: 'Account and all workspace data have been permanently deleted.' });
  });

  return router;
}

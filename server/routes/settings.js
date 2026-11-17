import express from 'express';
import crypto from 'node:crypto';
import { addDaysIso, getLocalTodayIso, logActivity, queryEnrichedTasks, sendError, withTransaction } from '../helpers.js';

const VALID_THEMES = new Set(['dark', 'light']);
const VALID_CAL_VIEWS = new Set(['month', 'week', 'day']);

function csvCell(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function createSettingsRouter(db) {
  const router = express.Router();

  router.get('/settings', (req, res) => {
    const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    if (!row) return sendError(res, 404, 'NOT_FOUND', 'Pengaturan tidak ditemukan.');
    res.json({
      settings: {
        ...row,
        sound_enabled: Boolean(row.sound_enabled),
      },
    });
  });

  router.patch('/settings', (req, res) => {
    const current = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    if (!current) return sendError(res, 404, 'NOT_FOUND', 'Pengaturan tidak ditemukan.');

    const theme = req.body?.theme !== undefined ? String(req.body.theme) : current.theme;
    const focusMin =
      req.body?.pomodoro_focus_min !== undefined
        ? Number(req.body.pomodoro_focus_min)
        : current.pomodoro_focus_min;
    const shortBreakMin =
      req.body?.pomodoro_short_break_min !== undefined
        ? Number(req.body.pomodoro_short_break_min)
        : current.pomodoro_short_break_min;
    const longBreakMin =
      req.body?.pomodoro_long_break_min !== undefined
        ? Number(req.body.pomodoro_long_break_min)
        : current.pomodoro_long_break_min;
    const soundEnabled =
      req.body?.sound_enabled !== undefined ? (req.body.sound_enabled ? 1 : 0) : current.sound_enabled;
    const defaultCalView =
      req.body?.default_calendar_view !== undefined
        ? String(req.body.default_calendar_view)
        : current.default_calendar_view;

    if (!VALID_THEMES.has(theme)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tema tidak valid.', 'theme');
    }
    if (!Number.isInteger(focusMin) || focusMin < 1 || focusMin > 180) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Durasi fokus harus antara 1 sampai 180 menit.', 'pomodoro_focus_min');
    }
    if (!Number.isInteger(shortBreakMin) || shortBreakMin < 1 || shortBreakMin > 60) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Durasi istirahat pendek harus antara 1 sampai 60 menit.',
        'pomodoro_short_break_min'
      );
    }
    if (!Number.isInteger(longBreakMin) || longBreakMin < 1 || longBreakMin > 90) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Durasi istirahat panjang harus antara 1 sampai 90 menit.',
        'pomodoro_long_break_min'
      );
    }
    if (!VALID_CAL_VIEWS.has(defaultCalView)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Tampilan kalender default tidak valid.', 'default_calendar_view');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE user_settings
      SET theme = ?, pomodoro_focus_min = ?, pomodoro_short_break_min = ?, pomodoro_long_break_min = ?,
          sound_enabled = ?, default_calendar_view = ?, updated_at = ?
      WHERE user_id = ?
    `).run(theme, focusMin, shortBreakMin, longBreakMin, soundEnabled, defaultCalView, now, req.user.id);

    const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    res.json({ settings: { ...updated, sound_enabled: Boolean(updated.sound_enabled) } });
  });

  router.get('/export/json', (req, res) => {
    const payload = {
      exported_at: new Date().toISOString(),
      app: 'TASKLY',
      user: req.user,
      settings: db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id),
      kanban_columns: db.prepare('SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position ASC').all(req.user.id),
      categories: db.prepare('SELECT * FROM task_categories WHERE user_id = ? ORDER BY name ASC').all(req.user.id),
      labels: db.prepare('SELECT * FROM task_labels WHERE user_id = ? ORDER BY name ASC').all(req.user.id),
      sprints: db.prepare('SELECT * FROM sprints WHERE user_id = ? ORDER BY start_date DESC').all(req.user.id),
      tasks: queryEnrichedTasks(db, req.user.id),
      focus_sessions: db
        .prepare('SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at DESC')
        .all(req.user.id),
    };
    res.json(payload);
  });

  router.get('/export/csv', (req, res) => {
    const tasks = queryEnrichedTasks(db, req.user.id);
    const headers = [
      'ID',
      'Judul',
      'Status Kolom',
      'Prioritas',
      'Kategori',
      'Sprint',
      'Tanggal Mulai',
      'Tenggat',
      'Subtask Selesai',
      'Total Subtask',
      'Selesai Pada',
      'Dibuat Pada',
    ];
    const lines = [headers.map(csvCell).join(',')];
    for (const t of tasks) {
      const doneSubs = t.subtasks.filter((s) => s.is_completed).length;
      lines.push(
        [
          t.id,
          t.title,
          t.column_name,
          t.priority,
          t.category_name || '',
          t.sprint_name || '',
          t.start_date || '',
          t.due_date || '',
          doneSubs,
          t.subtasks.length,
          t.completed_at || '',
          t.created_at,
        ]
          .map(csvCell)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(lines.join('\n'));
  });

  // Explicit user-triggered sample project seeder (never triggered silently)
  router.post('/workspace/seed-sample', (req, res) => {
    const existingCount = db.prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE user_id = ?').get(req.user.id).cnt;
    if (existingCount > 0) {
      return sendError(
        res,
        409,
        'WORKSPACE_NOT_EMPTY',
        'Proyek contoh hanya dapat dimuat ke workspace yang masih kosong.'
      );
    }

    const today = getLocalTodayIso(req.body?.today);
    const now = new Date().toISOString();
    const cols = db.prepare('SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position ASC').all(req.user.id);
    const colBySem = Object.fromEntries(cols.map((c) => [c.semantic_type, c.id]));

    withTransaction(db, () => {
      const catProduct = crypto.randomUUID();
      const catEng = crypto.randomUUID();
      const catDesign = crypto.randomUUID();
      db.prepare('INSERT OR IGNORE INTO task_categories (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
        catProduct, req.user.id, 'Product', 'accent', now
      );
      db.prepare('INSERT OR IGNORE INTO task_categories (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
        catEng, req.user.id, 'Engineering', 'secondary', now
      );
      db.prepare('INSERT OR IGNORE INTO task_categories (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
        catDesign, req.user.id, 'Design', 'warning', now
      );

      const lblCore = crypto.randomUUID();
      const lblUx = crypto.randomUUID();
      db.prepare('INSERT OR IGNORE INTO task_labels (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
        lblCore, req.user.id, 'Core', 'accent', now
      );
      db.prepare('INSERT OR IGNORE INTO task_labels (id, user_id, name, color_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
        lblUx, req.user.id, 'UI/UX', 'secondary', now
      );

      const sprintActiveId = crypto.randomUUID();
      const sprintPlannedId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO sprints (id, user_id, name, description, goal, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        sprintActiveId,
        req.user.id,
        'Sprint 01 (Sample): Rilis Alur Inti',
        'Data contoh opsional untuk eksplorasi fitur TASKLY.',
        'Menuntaskan alur papan Kanban, validasi form, dan sesi fokus perdana.',
        addDaysIso(today, -3),
        addDaysIso(today, 4),
        now,
        now
      );

      db.prepare(`
        INSERT INTO sprints (id, user_id, name, description, goal, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)
      `).run(
        sprintPlannedId,
        req.user.id,
        'Sprint 02 (Sample): Penguatan Analitik',
        'Siklus lanjutan untuk tinjauan kalender dan ekspor data.',
        'Memastikan konsistensi kalender mingguan dan laporan produktivitas.',
        addDaysIso(today, 5),
        addDaysIso(today, 12),
        now,
        now
      );

      const sampleTasks = [
        {
          title: 'Finalisasi arsitektur token warna Warm Espresso',
          description: 'Verifikasi rasio kontras minimal 4.5:1 di Dark Mode dan Light Mode.',
          columnId: colBySem.done,
          categoryId: catDesign,
          sprintId: sprintActiveId,
          priority: 'high',
          startDate: addDaysIso(today, -3),
          dueDate: addDaysIso(today, -1),
          completedAt: addDaysIso(today, -1) + 'T10:00:00.000Z',
          subtasks: [
            { title: 'Cek kontras teks di #1A1A1A', done: true },
            { title: 'Cek kontras tombol #6B4A2E di putih', done: true },
          ],
          labels: [lblUx],
        },
        {
          title: 'Implementasi Kanban drag-and-drop & status sheet mobile',
          description: 'Pastikan interaksi papan mulus di desktop maupun sentuhan 44px di mobile.',
          columnId: colBySem.in_progress,
          categoryId: catEng,
          sprintId: sprintActiveId,
          priority: 'urgent',
          startDate: addDaysIso(today, -1),
          dueDate: today,
          completedAt: null,
          subtasks: [
            { title: 'Konfigurasi sensor pointer & keyboard', done: true },
            { title: 'Uji tab switcher kolom di 375px', done: false },
          ],
          labels: [lblCore, lblUx],
        },
        {
          title: 'Tinjau alur penutupan sprint dan carry-over task',
          description: 'Sediakan pilihan pemindahan tugas tersisa ke Backlog atau Sprint berikutnya.',
          columnId: colBySem.review,
          categoryId: catProduct,
          sprintId: sprintActiveId,
          priority: 'high',
          startDate: today,
          dueDate: addDaysIso(today, 2),
          completedAt: null,
          subtasks: [],
          labels: [lblCore],
        },
        {
          title: 'Uji sesi Pomodoro 25 menit pada Focus Mode',
          description: 'Verifikasi timer tidak meleset saat berpindah tab browser.',
          columnId: colBySem.todo,
          categoryId: catEng,
          sprintId: sprintActiveId,
          priority: 'medium',
          startDate: today,
          dueDate: addDaysIso(today, 3),
          completedAt: null,
          subtasks: [],
          labels: [lblCore],
        },
        {
          title: 'Rancang struktur ekspor CSV laporan mingguan',
          description: 'Siapkan kolom status, tenggat, dan jumlah subtask.',
          columnId: colBySem.backlog,
          categoryId: catProduct,
          sprintId: sprintPlannedId,
          priority: 'low',
          startDate: addDaysIso(today, 5),
          dueDate: addDaysIso(today, 9),
          completedAt: null,
          subtasks: [],
          labels: [],
        },
      ];

      sampleTasks.forEach((item, idx) => {
        const tid = crypto.randomUUID();
        db.prepare(`
          INSERT INTO tasks (
            id, user_id, column_id, category_id, sprint_id, assignee_id,
            title, description, priority, start_date, due_date,
            position_in_column, completed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          tid,
          req.user.id,
          item.columnId,
          item.categoryId,
          item.sprintId,
          req.user.id,
          item.title,
          item.description,
          item.priority,
          item.startDate,
          item.dueDate,
          (idx + 1) * 1000,
          item.completedAt,
          addDaysIso(today, -3) + 'T08:00:00.000Z',
          now
        );

        item.subtasks.forEach((st, sIdx) => {
          db.prepare('INSERT INTO subtasks (id, task_id, title, is_completed, position, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
            crypto.randomUUID(), tid, st.title, st.done ? 1 : 0, sIdx, now
          );
        });

        item.labels.forEach((lid) => {
          db.prepare('INSERT INTO task_label_assignments (task_id, label_id) VALUES (?, ?)').run(tid, lid);
        });

        if (item.sprintId) {
          db.prepare('INSERT INTO sprint_tasks (id, sprint_id, task_id, added_at) VALUES (?, ?, ?, ?)').run(
            crypto.randomUUID(),
            item.sprintId,
            tid,
            addDaysIso(today, -3) + 'T08:00:00.000Z'
          );
        }

        if (idx === 1) {
          db.prepare(`
            INSERT INTO focus_sessions (id, user_id, task_id, mode, planned_duration_sec, actual_duration_sec, status, started_at, ended_at)
            VALUES (?, ?, ?, 'focus', 1500, 1500, 'completed', ?, ?)
          `).run(
            crypto.randomUUID(),
            req.user.id,
            tid,
            today + 'T09:00:00.000Z',
            today + 'T09:25:00.000Z'
          );
        }
      });

      logActivity(db, req.user.id, 'sprint', sprintActiveId, 'sprint_started', { name: 'Sprint 01 (Sample): Rilis Alur Inti' });
    });

    res.status(201).json({ message: 'Proyek contoh berhasil dimuat.' });
  });

  return router;
}

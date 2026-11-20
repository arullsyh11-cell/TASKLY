import express from 'express';
import crypto from 'node:crypto';
import { addDaysIso, getLocalTodayIso, logActivity, queryEnrichedTasks, sendError, withTransaction } from '../helpers.js';

const VALID_THEMES = new Set(['dark', 'light', 'monochrome']);
const VALID_NAV_STYLES = new Set(['radial', 'sidebar']);
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
    if (!row) return sendError(res, 404, 'NOT_FOUND', 'Settings not found.');
    res.json({
      settings: {
        ...row,
        sound_enabled: Boolean(row.sound_enabled),
        reminder_enabled: row.reminder_enabled !== undefined ? Boolean(row.reminder_enabled) : true,
        default_reminder_days: row.default_reminder_days ?? 1,
      },
    });
  });

  router.patch('/settings', (req, res) => {
    const current = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    if (!current) return sendError(res, 404, 'NOT_FOUND', 'Settings not found.');

    const theme = req.body?.theme !== undefined ? String(req.body.theme) : current.theme;
    const navStyle = req.body?.nav_style !== undefined ? String(req.body.nav_style) : current.nav_style || 'radial';
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
    const reminderEnabled =
      req.body?.reminder_enabled !== undefined
        ? req.body.reminder_enabled
          ? 1
          : 0
        : current.reminder_enabled ?? 1;
    const defaultReminderDays =
      req.body?.default_reminder_days !== undefined
        ? Number(req.body.default_reminder_days)
        : current.default_reminder_days ?? 1;
    const defaultCalView =
      req.body?.default_calendar_view !== undefined
        ? String(req.body.default_calendar_view)
        : current.default_calendar_view;

    if (!VALID_THEMES.has(theme)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid theme.', 'theme');
    }
    if (!VALID_NAV_STYLES.has(navStyle)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid navigation style.', 'nav_style');
    }
    if (!Number.isInteger(defaultReminderDays) || defaultReminderDays < 0 || defaultReminderDays > 60) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Default reminder lead time must be between 0 and 60 days.',
        'default_reminder_days'
      );
    }
    if (!Number.isInteger(focusMin) || focusMin < 1 || focusMin > 180) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Focus duration must be between 1 and 180 minutes.', 'pomodoro_focus_min');
    }
    if (!Number.isInteger(shortBreakMin) || shortBreakMin < 1 || shortBreakMin > 60) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Short break duration must be between 1 and 60 minutes.',
        'pomodoro_short_break_min'
      );
    }
    if (!Number.isInteger(longBreakMin) || longBreakMin < 1 || longBreakMin > 90) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Long break duration must be between 1 and 90 minutes.',
        'pomodoro_long_break_min'
      );
    }
    if (!VALID_CAL_VIEWS.has(defaultCalView)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid default calendar view.', 'default_calendar_view');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE user_settings
      SET theme = ?, nav_style = ?, pomodoro_focus_min = ?, pomodoro_short_break_min = ?, pomodoro_long_break_min = ?,
          sound_enabled = ?, reminder_enabled = ?, default_reminder_days = ?, default_calendar_view = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      theme,
      navStyle,
      focusMin,
      shortBreakMin,
      longBreakMin,
      soundEnabled,
      reminderEnabled,
      defaultReminderDays,
      defaultCalView,
      now,
      req.user.id
    );

    const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    res.json({
      settings: {
        ...updated,
        sound_enabled: Boolean(updated.sound_enabled),
        reminder_enabled: Boolean(updated.reminder_enabled),
      },
    });
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
      'Title',
      'Column Status',
      'Priority',
      'Category',
      'Sprint',
      'Start Date',
      'Due Date',
      'Completed Subtasks',
      'Total Subtasks',
      'Completed At',
      'Created At',
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
        'Sample project can only be loaded into an empty workspace.'
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
        'Sprint 01 (Sample): Core Flow Release',
        'Optional sample data to explore TASKLY features.',
        'Finish the Kanban workflow, form validation, and initial focus sessions.',
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
        'Sprint 02 (Sample): Analytics Polish',
        'Follow-up cycle for calendar review and data export.',
        'Verify weekly calendar consistency and productivity reports.',
        addDaysIso(today, 5),
        addDaysIso(today, 12),
        now,
        now
      );

      const sampleTasks = [
        {
          title: 'Finalize Warm Espresso color token architecture',
          description: 'Verify minimum 4.5:1 contrast ratio across Light and Monochrome themes.',
          columnId: colBySem.done,
          categoryId: catDesign,
          sprintId: sprintActiveId,
          priority: 'high',
          startDate: addDaysIso(today, -3),
          dueDate: addDaysIso(today, -1),
          completedAt: addDaysIso(today, -1) + 'T10:00:00.000Z',
          subtasks: [
            { title: 'Verify text contrast on #1A1A1A', done: true },
            { title: 'Verify #6B4A2E button contrast on light background', done: true },
          ],
          labels: [lblUx],
        },
        {
          title: 'Implement Kanban drag-and-drop & mobile status sheet',
          description: 'Ensure smooth board interactions on desktop and 44px touch targets on mobile.',
          columnId: colBySem.in_progress,
          categoryId: catEng,
          sprintId: sprintActiveId,
          priority: 'urgent',
          startDate: addDaysIso(today, -1),
          dueDate: today,
          completedAt: null,
          subtasks: [
            { title: 'Configure pointer and keyboard sensors', done: true },
            { title: 'Test column switcher tabs at 375px', done: false },
          ],
          labels: [lblCore, lblUx],
        },
        {
          title: 'Review sprint closure flow and task carry-over',
          description: 'Offer options to move remaining tasks to Backlog or the next Sprint.',
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
          title: 'Verify 25-minute Pomodoro session in Focus Mode',
          description: 'Confirm timer accuracy when switching browser tabs.',
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
          title: 'Design CSV export structure for weekly reports',
          description: 'Include status columns, deadlines, and subtask counts.',
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

      logActivity(db, req.user.id, 'sprint', sprintActiveId, 'sprint_started', { name: 'Sprint 01 (Sample): Core Flow Release' });
    });

    res.status(201).json({ message: 'Sample project loaded successfully.' });
  });

  return router;
}

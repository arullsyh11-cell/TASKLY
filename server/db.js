import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createDatabase(dbPath = './data/taskly.db') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('dark', 'light', 'monochrome')),
      nav_style TEXT NOT NULL DEFAULT 'radial' CHECK (nav_style IN ('radial', 'sidebar')),
      pomodoro_focus_min INTEGER NOT NULL DEFAULT 25 CHECK (pomodoro_focus_min BETWEEN 1 AND 180),
      pomodoro_short_break_min INTEGER NOT NULL DEFAULT 5 CHECK (pomodoro_short_break_min BETWEEN 1 AND 60),
      pomodoro_long_break_min INTEGER NOT NULL DEFAULT 15 CHECK (pomodoro_long_break_min BETWEEN 1 AND 90),
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      default_reminder_days INTEGER NOT NULL DEFAULT 1 CHECK (default_reminder_days BETWEEN 0 AND 60),
      default_calendar_view TEXT NOT NULL DEFAULT 'month' CHECK (default_calendar_view IN ('month', 'week', 'day')),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kanban_columns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      semantic_type TEXT NOT NULL CHECK (semantic_type IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
      position INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color_token TEXT NOT NULL DEFAULT 'accent',
      created_at TEXT NOT NULL,
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS task_labels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color_token TEXT NOT NULL DEFAULT 'secondary',
      created_at TEXT NOT NULL,
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'archived')),
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (end_date >= start_date)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      column_id TEXT NOT NULL REFERENCES kanban_columns(id),
      category_id TEXT REFERENCES task_categories(id) ON DELETE SET NULL,
      sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      start_date TEXT,
      due_date TEXT,
      reminder_days_before INTEGER DEFAULT 1 CHECK (reminder_days_before IS NULL OR (reminder_days_before BETWEEN 0 AND 60)),
      position_in_column REAL NOT NULL DEFAULT 1000,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
    );

    CREATE TABLE IF NOT EXISTS task_label_assignments (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES task_labels(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sprint_tasks (
      id TEXT PRIMARY KEY,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      removed_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sprint_tasks_active
      ON sprint_tasks (sprint_id, task_id)
      WHERE removed_at IS NULL;

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break', 'custom')),
      planned_duration_sec INTEGER NOT NULL CHECK (planned_duration_sec > 0),
      actual_duration_sec INTEGER NOT NULL CHECK (actual_duration_sec >= 0),
      status TEXT NOT NULL CHECK (status IN ('completed', 'interrupted')),
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'sprint', 'focus_session', 'column')),
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_col_pos ON tasks (user_id, column_id, position_in_column);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks (user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_sprint ON tasks (user_id, sprint_id);
    CREATE INDEX IF NOT EXISTS idx_focus_user_started ON focus_sessions (user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_user_created ON activity_logs (user_id, created_at DESC);
  `);

  // Safe incremental column migrations for pre-existing local SQLite databases
  const taskCols = new Set(db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name));
  if (!taskCols.has('reminder_days_before')) {
    db.exec('ALTER TABLE tasks ADD COLUMN reminder_days_before INTEGER DEFAULT 1');
  }
  const settingCols = new Set(db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name));
  if (!settingCols.has('default_reminder_days')) {
    db.exec('ALTER TABLE user_settings ADD COLUMN default_reminder_days INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingCols.has('reminder_enabled')) {
    db.exec('ALTER TABLE user_settings ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!settingCols.has('nav_style')) {
    db.exec("ALTER TABLE user_settings ADD COLUMN nav_style TEXT NOT NULL DEFAULT 'radial'");
  }

  return db;
}

export function bootstrapUserDefaults(db, userId) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO user_settings (
      user_id, theme, nav_style, pomodoro_focus_min, pomodoro_short_break_min, pomodoro_long_break_min,
      sound_enabled, reminder_enabled, default_reminder_days, default_calendar_view, updated_at
    ) VALUES (?, 'light', 'radial', 25, 5, 15, 1, 1, 1, 'month', ?)
  `).run(userId, now);

  const existingCols = db.prepare('SELECT COUNT(*) AS cnt FROM kanban_columns WHERE user_id = ?').get(userId);
  if (existingCols.cnt === 0) {
    const defaults = [
      { name: 'Backlog', semantic_type: 'backlog', position: 0 },
      { name: 'To Do', semantic_type: 'todo', position: 1 },
      { name: 'In Progress', semantic_type: 'in_progress', position: 2 },
      { name: 'Review', semantic_type: 'review', position: 3 },
      { name: 'Done', semantic_type: 'done', position: 4 },
    ];
    const insertCol = db.prepare(`
      INSERT INTO kanban_columns (id, user_id, name, semantic_type, position, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    for (const col of defaults) {
      insertCol.run(crypto.randomUUID(), userId, col.name, col.semantic_type, col.position, now);
    }
  }
}

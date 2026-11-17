import crypto from 'node:crypto';

export function sendError(res, status, code, message, field = undefined, retryable = false) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(field ? { field } : {}),
      retryable,
    },
  });
}

export function logActivity(db, userId, entityType, entityId, action, metadata = {}) {
  db.prepare(`
    INSERT INTO activity_logs (id, user_id, entity_type, entity_id, action, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    userId,
    entityType,
    entityId,
    action,
    JSON.stringify(metadata),
    new Date().toISOString()
  );
}

export function getLocalTodayIso(queryToday) {
  if (typeof queryToday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(queryToday)) {
    return queryToday;
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(dateIso, days) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function dateRangeDays(startIso, endIso) {
  const days = [];
  let curr = startIso;
  let guard = 0;
  while (curr <= endIso && guard < 366) {
    days.push(curr);
    curr = addDaysIso(curr, 1);
    guard += 1;
  }
  return days;
}

export function enrichTasks(db, userId, rows) {
  if (!rows || rows.length === 0) return [];
  const taskIds = rows.map((r) => r.id);
  const placeholders = taskIds.map(() => '?').join(',');

  const subtasks = db.prepare(`
    SELECT id, task_id, title, is_completed, position, created_at
    FROM subtasks
    WHERE task_id IN (${placeholders})
    ORDER BY position ASC, created_at ASC
  `).all(...taskIds);

  const labelRows = db.prepare(`
    SELECT tla.task_id, tl.id, tl.name, tl.color_token
    FROM task_label_assignments tla
    JOIN task_labels tl ON tl.id = tla.label_id
    WHERE tla.task_id IN (${placeholders}) AND tl.user_id = ?
    ORDER BY tl.name ASC
  `).all(...taskIds, userId);

  const subtasksMap = new Map();
  for (const st of subtasks) {
    if (!subtasksMap.has(st.task_id)) subtasksMap.set(st.task_id, []);
    subtasksMap.get(st.task_id).push({
      ...st,
      is_completed: Boolean(st.is_completed),
    });
  }

  const labelsMap = new Map();
  for (const lb of labelRows) {
    if (!labelsMap.has(lb.task_id)) labelsMap.set(lb.task_id, []);
    labelsMap.get(lb.task_id).push({ id: lb.id, name: lb.name, color_token: lb.color_token });
  }

  return rows.map((row) => ({
    ...row,
    subtasks: subtasksMap.get(row.id) || [],
    labels: labelsMap.get(row.id) || [],
  }));
}

export function queryEnrichedTasks(db, userId, whereSql = '', params = [], orderSql = 't.position_in_column ASC, t.created_at DESC') {
  const rows = db.prepare(`
    SELECT
      t.*,
      kc.name AS column_name,
      kc.semantic_type AS semantic_type,
      tc.name AS category_name,
      tc.color_token AS category_color,
      s.name AS sprint_name,
      s.status AS sprint_status
    FROM tasks t
    JOIN kanban_columns kc ON kc.id = t.column_id
    LEFT JOIN task_categories tc ON tc.id = t.category_id
    LEFT JOIN sprints s ON s.id = t.sprint_id
    WHERE t.user_id = ? ${whereSql}
    ORDER BY ${orderSql}
  `).all(userId, ...params);

  return enrichTasks(db, userId, rows);
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

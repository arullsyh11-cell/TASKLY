import express from 'express';
import { addDaysIso, getLocalTodayIso, queryEnrichedTasks } from '../helpers.js';

export function createDashboardRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const today = getLocalTodayIso(req.query.today);
    const next7 = addDaysIso(today, 7);

    const countsRow = db
      .prepare(
        `
        SELECT
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN kc.semantic_type = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
          SUM(CASE WHEN kc.semantic_type IN ('in_progress', 'review') THEN 1 ELSE 0 END) AS in_progress_tasks,
          SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < ? AND kc.semantic_type != 'done' THEN 1 ELSE 0 END) AS overdue_tasks
        FROM tasks t
        JOIN kanban_columns kc ON kc.id = t.column_id
        WHERE t.user_id = ?
      `
      )
      .get(today, req.user.id);

    const activeSprint = db
      .prepare("SELECT * FROM sprints WHERE user_id = ? AND status = 'active' LIMIT 1")
      .get(req.user.id);

    let enrichedSprint = null;
    if (activeSprint) {
      const spStats = db
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
        .get(req.user.id, activeSprint.id);
      const total = Number(spStats?.total_tasks || 0);
      const completed = Number(spStats?.completed_tasks || 0);
      enrichedSprint = {
        ...activeSprint,
        total_tasks: total,
        completed_tasks: completed,
        remaining_tasks: Math.max(0, total - completed),
        progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    }

    const upcomingDeadlines = queryEnrichedTasks(
      db,
      req.user.id,
      "AND kc.semantic_type != 'done' AND ((t.due_date IS NOT NULL AND t.due_date <= ?) OR t.priority IN ('urgent', 'high'))",
      [next7],
      "CASE WHEN t.due_date IS NOT NULL AND t.due_date < '" + today + "' THEN 0 ELSE 1 END ASC, CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC"
    ).slice(0, 8);

    const completedTodayRow = db
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM tasks
        WHERE user_id = ? AND completed_at IS NOT NULL AND substr(completed_at, 1, 10) = ?
      `
      )
      .get(req.user.id, today);

    const focusTodayRow = db
      .prepare(
        `
        SELECT
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS sessions_completed,
          COALESCE(SUM(actual_duration_sec), 0) AS focus_sec
        FROM focus_sessions
        WHERE user_id = ? AND mode IN ('focus', 'custom') AND substr(started_at, 1, 10) = ?
      `
      )
      .get(req.user.id, today);

    const activities = db
      .prepare(
        `
        SELECT id, entity_type, entity_id, action, metadata, created_at
        FROM activity_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `
      )
      .all(req.user.id)
      .map((a) => {
        let parsed = {};
        try {
          parsed = JSON.parse(a.metadata || '{}');
        } catch {
          parsed = {};
        }
        return { ...a, metadata: parsed };
      });

    res.json({
      today,
      counts: {
        total: Number(countsRow?.total_tasks || 0),
        completed: Number(countsRow?.completed_tasks || 0),
        in_progress: Number(countsRow?.in_progress_tasks || 0),
        overdue: Number(countsRow?.overdue_tasks || 0),
      },
      active_sprint: enrichedSprint,
      upcoming_deadlines: upcomingDeadlines,
      daily_overview: {
        completed_today: Number(completedTodayRow?.cnt || 0),
        focus_sec_today: Number(focusTodayRow?.focus_sec || 0),
        focus_sessions_today: Number(focusTodayRow?.sessions_completed || 0),
      },
      recent_activities: activities,
    });
  });

  return router;
}

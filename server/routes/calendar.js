import express from 'express';
import { addDaysIso, getLocalTodayIso, queryEnrichedTasks, sendError } from '../helpers.js';

export function createCalendarRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const today = getLocalTodayIso(req.query.today);
    const start = req.query.start || addDaysIso(today, -15);
    const end = req.query.end || addDaysIso(today, 30);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Rentang tanggal kalender tidak valid.');
    }

    const tasks = queryEnrichedTasks(
      db,
      req.user.id,
      'AND ((t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?) OR (t.start_date IS NOT NULL AND t.due_date IS NOT NULL AND t.start_date <= ? AND t.due_date >= ?))',
      [start, end, end, start],
      'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC, t.created_at DESC'
    );

    const sprints = db
      .prepare(
        `
        SELECT *
        FROM sprints
        WHERE user_id = ?
          AND start_date <= ?
          AND end_date >= ?
          AND status != 'archived'
        ORDER BY start_date ASC
      `
      )
      .all(req.user.id, end, start);

    const upcomingTasks = queryEnrichedTasks(
      db,
      req.user.id,
      "AND kc.semantic_type != 'done' AND t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?",
      [today, addDaysIso(today, 14)],
      't.due_date ASC'
    );

    res.json({ tasks, sprints, upcoming_tasks: upcomingTasks });
  });

  return router;
}

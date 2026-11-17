import express from 'express';
import { addDaysIso, dateRangeDays, getLocalTodayIso } from '../helpers.js';

export function createAnalyticsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const today = getLocalTodayIso(req.query.today);
    const rangeKey = req.query.range === '30d' || req.query.range === '90d' ? req.query.range : '7d';
    const dayCount = rangeKey === '90d' ? 90 : rangeKey === '30d' ? 30 : 7;
    const startIso = addDaysIso(today, -(dayCount - 1));
    const days = dateRangeDays(startIso, today);

    // Overall completion & status breakdown
    const tasks = db
      .prepare(
        `
        SELECT t.id, t.created_at, t.completed_at, kc.semantic_type
        FROM tasks t
        JOIN kanban_columns kc ON kc.id = t.column_id
        WHERE t.user_id = ?
      `
      )
      .all(req.user.id);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.semantic_type === 'done').length;
    const pendingTasks = totalTasks - completedTasks;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const semanticCounts = {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    };
    for (const t of tasks) {
      if (semanticCounts[t.semantic_type] !== undefined) {
        semanticCounts[t.semantic_type] += 1;
      }
    }

    const focusRows = db
      .prepare(
        `
        SELECT mode, planned_duration_sec, actual_duration_sec, status, started_at
        FROM focus_sessions
        WHERE user_id = ? AND mode IN ('focus', 'custom')
      `
      )
      .all(req.user.id);

    const dayMap = new Map();
    for (const d of days) {
      dayMap.set(d, {
        date: d,
        label: d.slice(5),
        tasks_completed: 0,
        tasks_created: 0,
        focus_minutes: 0,
      });
    }

    for (const t of tasks) {
      const createdDay = t.created_at.slice(0, 10);
      if (dayMap.has(createdDay)) {
        dayMap.get(createdDay).tasks_created += 1;
      }
      if (t.completed_at) {
        const compDay = t.completed_at.slice(0, 10);
        if (dayMap.has(compDay)) {
          dayMap.get(compDay).tasks_completed += 1;
        }
      }
    }

    let rangeFocusSec = 0;
    let completedFocusSessions = 0;
    let interruptedFocusSessions = 0;

    for (const fs of focusRows) {
      const day = fs.started_at.slice(0, 10);
      if (day >= startIso && day <= today) {
        rangeFocusSec += Number(fs.actual_duration_sec || 0);
        if (fs.status === 'completed') completedFocusSessions += 1;
        else interruptedFocusSessions += 1;
      }
      if (dayMap.has(day)) {
        dayMap.get(day).focus_minutes += Math.round(Number(fs.actual_duration_sec || 0) / 60);
      }
    }

    const dailyTrend = Array.from(dayMap.values());

    // Weekly productivity (group continuous days into 7-day buckets, last 8 weeks)
    const weekStart = addDaysIso(today, -55);
    const weekBuckets = [];
    for (let i = 0; i < 8; i += 1) {
      const bStart = addDaysIso(weekStart, i * 7);
      const bEnd = addDaysIso(bStart, 6);
      const completedInBucket = tasks.filter(
        (t) => t.completed_at && t.completed_at.slice(0, 10) >= bStart && t.completed_at.slice(0, 10) <= bEnd
      ).length;
      const focusMinInBucket = Math.round(
        focusRows
          .filter((fs) => fs.started_at.slice(0, 10) >= bStart && fs.started_at.slice(0, 10) <= bEnd)
          .reduce((acc, fs) => acc + Number(fs.actual_duration_sec || 0), 0) / 60
      );
      weekBuckets.push({
        label: `${bStart.slice(5)}`,
        range: `${bStart} s.d. ${bEnd}`,
        tasks_completed: completedInBucket,
        focus_minutes: focusMinInBucket,
      });
    }

    // Monthly productivity (last 6 months including current)
    const [curYear, curMonth] = today.split('-').map(Number);
    const monthlyBuckets = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const dt = new Date(Date.UTC(curYear, curMonth - 1 - offset, 1));
      const ym = dt.toISOString().slice(0, 7);
      const compCount = tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 7) === ym).length;
      const focMin = Math.round(
        focusRows
          .filter((fs) => fs.started_at.slice(0, 7) === ym)
          .reduce((acc, fs) => acc + Number(fs.actual_duration_sec || 0), 0) / 60
      );
      monthlyBuckets.push({
        month: ym,
        tasks_completed: compCount,
        focus_minutes: focMin,
      });
    }

    // Sprint completion rates
    const sprints = db
      .prepare("SELECT * FROM sprints WHERE user_id = ? AND status != 'planned' ORDER BY start_date DESC LIMIT 10")
      .all(req.user.id);

    const sprintRates = sprints.map((sp) => {
      const st = db
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
        .get(req.user.id, sp.id);
      const total = Number(st?.total_tasks || 0);
      const completed = Number(st?.completed_tasks || 0);
      return {
        id: sp.id,
        name: sp.name,
        status: sp.status,
        start_date: sp.start_date,
        end_date: sp.end_date,
        total_tasks: total,
        completed_tasks: completed,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });

    const totalSessionsRange = completedFocusSessions + interruptedFocusSessions;
    const avgSessionMin =
      totalSessionsRange > 0 ? Math.round(rangeFocusSec / 60 / totalSessionsRange) : 0;

    res.json({
      range: rangeKey,
      start_date: startIso,
      end_date: today,
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        pending_tasks: pendingTasks,
        completion_rate: completionRate,
        range_focus_sec: rangeFocusSec,
        completed_focus_sessions: completedFocusSessions,
        interrupted_focus_sessions: interruptedFocusSessions,
        avg_session_min: avgSessionMin,
      },
      status_breakdown: [
        { key: 'backlog', label: 'Backlog', count: semanticCounts.backlog },
        { key: 'todo', label: 'To Do', count: semanticCounts.todo },
        { key: 'in_progress', label: 'In Progress', count: semanticCounts.in_progress },
        { key: 'review', label: 'Review', count: semanticCounts.review },
        { key: 'done', label: 'Done', count: semanticCounts.done },
      ],
      daily_trend: dailyTrend,
      weekly_productivity: weekBuckets,
      monthly_productivity: monthlyBuckets,
      sprint_rates: sprintRates,
    });
  });

  return router;
}

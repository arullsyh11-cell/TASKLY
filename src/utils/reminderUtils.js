import { addDaysIso, daysRemaining, formatDateId, getTodayIso } from './dateUtils.js';

export const REMINDER_PRESETS = [
  { value: '1', label: '1 day before deadline (Default)' },
  { value: '0', label: 'On due date (Day of)' },
  { value: '2', label: '2 days before deadline' },
  { value: '3', label: '3 days before deadline' },
  { value: '7', label: '7 days before deadline' },
  { value: 'custom', label: 'Custom days...' },
  { value: 'off', label: 'Disable reminder' },
];

export const REMINDER_PRESET_NUMBERS = new Set([0, 1, 2, 3, 7]);

export function clampReminderDays(value, fallback = 1) {
  if (value === null) return null;
  if (value === undefined || value === '') return fallback;
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(60, num));
}

export function resolveTaskReminderDays(task, fallbackDefaultDays = 1) {
  if (!task?.due_date) return null;
  if (task.reminder_days_before === null) return null;
  if (task.reminder_days_before === undefined) {
    return clampReminderDays(fallbackDefaultDays, 1);
  }
  return clampReminderDays(task.reminder_days_before, fallbackDefaultDays);
}

export function getTaskReminderDateIso(dueDateIso, daysBefore) {
  if (!dueDateIso || daysBefore === null || daysBefore === undefined) return null;
  return addDaysIso(dueDateIso, -clampReminderDays(daysBefore, 1));
}

export function formatReminderBadgeLabel(daysBefore) {
  if (daysBefore === null || daysBefore === undefined) return null;
  if (daysBefore === 0) return 'Due Day';
  return `D-${daysBefore}`;
}

export function buildReminderSignature(taskId, todayIso, dueDate, daysBefore) {
  return `${taskId}|${dueDate || ''}|${daysBefore ?? 'off'}|${todayIso}`;
}

export function formatReminderMessage(task, todayIso = getTodayIso()) {
  const daysLeft = daysRemaining(task.due_date, todayIso);
  const dateText = formatDateId(task.due_date, 'MMMM d, yyyy');

  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      title: 'Overdue Deadline Reminder',
      message: `Don't forget, task "${task.title}" was due on ${dateText} (${overdueDays} ${
        overdueDays === 1 ? 'day' : 'days'
      } overdue).`,
      urgency: 'overdue',
      daysLeft,
      dateText,
    };
  }

  if (daysLeft === 0) {
    return {
      title: 'Deadline Due Today',
      message: `Don't forget, you have task "${task.title}" due today (${dateText}).`,
      urgency: 'today',
      daysLeft,
      dateText,
    };
  }

  if (daysLeft === 1) {
    return {
      title: 'Deadline Due Tomorrow',
      message: `Don't forget, you have task "${task.title}" due on ${dateText} (tomorrow).`,
      urgency: 'soon',
      daysLeft,
      dateText,
    };
  }

  return {
    title: `Deadline Reminder (${daysLeft} Days Left)`,
    message: `Don't forget, you have task "${task.title}" due on ${dateText} (${daysLeft} days left).`,
    urgency: 'upcoming',
    daysLeft,
    dateText,
  };
}

export function evaluateTaskReminders(tasks = [], { todayIso = getTodayIso(), defaultDays = 1 } = {}) {
  const dueNow = [];
  const scheduled = [];

  for (const task of tasks) {
    if (!task?.due_date || task.semantic_type === 'done') continue;
    const daysBefore = resolveTaskReminderDays(task, defaultDays);
    if (daysBefore === null) continue;

    const reminderDateIso = getTaskReminderDateIso(task.due_date, daysBefore);
    if (!reminderDateIso) continue;

    const copy = formatReminderMessage(task, todayIso);
    const entry = {
      task,
      daysBefore,
      badgeLabel: formatReminderBadgeLabel(daysBefore),
      reminderDateIso,
      signature: buildReminderSignature(task.id, todayIso, task.due_date, daysBefore),
      ...copy,
    };

    if (reminderDateIso <= todayIso) {
      dueNow.push(entry);
    } else {
      scheduled.push(entry);
    }
  }

  dueNow.sort((a, b) => a.daysLeft - b.daysLeft || a.task.due_date.localeCompare(b.task.due_date));
  scheduled.sort((a, b) => a.reminderDateIso.localeCompare(b.reminderDateIso));

  return { dueNow, scheduled };
}

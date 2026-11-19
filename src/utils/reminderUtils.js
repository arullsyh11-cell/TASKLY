import { addDaysIso, daysRemaining, formatDateId, getTodayIso } from './dateUtils.js';

export const REMINDER_PRESETS = [
  { value: '1', label: '1 hari sebelum deadline (Default)' },
  { value: '0', label: 'Hari H (tepat tanggal deadline)' },
  { value: '2', label: '2 hari sebelum deadline' },
  { value: '3', label: '3 hari sebelum deadline' },
  { value: '7', label: '7 hari sebelum deadline' },
  { value: 'custom', label: 'Custom jumlah hari...' },
  { value: 'off', label: 'Nonaktifkan pengingat' },
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
  if (daysBefore === 0) return 'Hari H';
  return `H-${daysBefore}`;
}

export function buildReminderSignature(taskId, todayIso, dueDate, daysBefore) {
  return `${taskId}|${dueDate || ''}|${daysBefore ?? 'off'}|${todayIso}`;
}

export function formatReminderMessage(task, todayIso = getTodayIso()) {
  const daysLeft = daysRemaining(task.due_date, todayIso);
  const dateText = formatDateId(task.due_date, 'd MMMM yyyy');

  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      title: 'Pengingat Deadline Terlewat',
      message: `Jangan lupa, tugas "${task.title}" deadlinenya tanggal ${dateText} (terlewat ${overdueDays} hari).`,
      urgency: 'overdue',
      daysLeft,
      dateText,
    };
  }

  if (daysLeft === 0) {
    return {
      title: 'Pengingat Deadline Hari Ini',
      message: `Jangan lupa ada tugas "${task.title}" yang deadlinenya hari ini (${dateText}).`,
      urgency: 'today',
      daysLeft,
      dateText,
    };
  }

  if (daysLeft === 1) {
    return {
      title: 'Pengingat Deadline Besok',
      message: `Jangan lupa ada tugas "${task.title}" yang deadlinenya tanggal ${dateText} (besok).`,
      urgency: 'soon',
      daysLeft,
      dateText,
    };
  }

  return {
    title: `Pengingat Deadline (${daysLeft} Hari Lagi)`,
    message: `Jangan lupa ada tugas "${task.title}" yang deadlinenya tanggal ${dateText} (${daysLeft} hari lagi).`,
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

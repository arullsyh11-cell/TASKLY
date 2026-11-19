import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repo } from '../../services/repositories/index.js';
import { useReminderStore } from '../../stores/useReminderStore.js';
import { getTodayIso } from '../../utils/dateUtils.js';
import { evaluateTaskReminders } from '../../utils/reminderUtils.js';

export function useReminders() {
  const [todayIso, setTodayIso] = useState(() => getTodayIso());
  const acknowledged = useReminderStore((s) => s.acknowledged);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = getTodayIso();
      setTodayIso((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { scope: 'reminders' }],
    queryFn: () => repo.tasks.list({ sort: 'due_date' }),
    staleTime: 15_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => repo.settings.get(),
    staleTime: 60_000,
  });

  const reminderEnabled = settings?.reminder_enabled !== false;
  const defaultDays = settings?.default_reminder_days ?? 1;

  const evaluated = useMemo(() => {
    if (!reminderEnabled) {
      return { dueNow: [], scheduled: [], unreadDueNow: [], unreadCount: 0 };
    }
    const { dueNow, scheduled } = evaluateTaskReminders(tasks, { todayIso, defaultDays });
    const unreadDueNow = dueNow.filter((entry) => !acknowledged[entry.signature]);
    return {
      dueNow,
      scheduled,
      unreadDueNow,
      unreadCount: unreadDueNow.length,
    };
  }, [tasks, todayIso, defaultDays, reminderEnabled, acknowledged]);

  return {
    ...evaluated,
    todayIso,
    reminderEnabled,
    defaultDays,
    soundEnabled: settings?.sound_enabled !== false,
  };
}

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/useUiStore.js';
import { useReminderStore } from '../../stores/useReminderStore.js';
import { playReminderChime, sendReminderNotification } from '../../utils/focusAudio.js';
import { useReminders } from './useReminders.js';

export function GlobalReminderEngine() {
  const { dueNow, reminderEnabled, soundEnabled } = useReminders();
  const dispatched = useReminderStore((s) => s.dispatched);
  const markDispatched = useReminderStore((s) => s.markDispatched);
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);

  useEffect(() => {
    if (!reminderEnabled || dueNow.length === 0) return;

    const fresh = dueNow.filter((entry) => !dispatched[entry.signature]);
    if (fresh.length === 0) return;

    markDispatched(fresh.map((entry) => entry.signature));

    if (soundEnabled) {
      playReminderChime();
    }

    if (fresh.length <= 2) {
      fresh.forEach((entry) => {
        sendReminderNotification(entry.title, entry.message, `taskly-rem-${entry.task.id}`);
        toast.warning(entry.title, {
          description: entry.message,
          duration: 9000,
          action: {
            label: 'View Task',
            onClick: () => openTaskDrawer(entry.task.id),
          },
        });
      });
    } else {
      const lead = fresh[0];
      const summaryMsg = `${lead.message} (+${fresh.length - 1} more tasks approaching deadline.)`;
      sendReminderNotification(`Reminder: ${fresh.length} Tasks Near Deadline`, summaryMsg, 'taskly-rem-batch');
      toast.warning(`${fresh.length} Tasks Have Active Deadline Reminders`, {
        description: lead.message,
        duration: 9500,
        action: {
          label: 'View Task',
          onClick: () => openTaskDrawer(lead.task.id),
        },
      });
    }
  }, [dueNow, dispatched, reminderEnabled, soundEnabled, markDispatched, openTaskDrawer]);

  return null;
}

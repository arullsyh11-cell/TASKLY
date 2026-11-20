import { describe, it, expect, beforeEach } from 'vitest';
import { useTimerStore } from '../src/stores/useTimerStore.js';
import { dateRangeDays, formatDurationHuman, formatSecondsClock, isTaskOverdue } from '../src/utils/dateUtils.js';
import {
  evaluateTaskReminders,
  formatReminderMessage,
  getTaskReminderDateIso,
  resolveTaskReminderDays,
} from '../src/utils/reminderUtils.js';

describe('Focus Timer Store & Date Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    useTimerStore.getState().setMode('focus');
    useTimerStore.getState().setModeDuration('focus', 25);
    useTimerStore.getState().reset();
  });

  it('defaults to 25 / 5 / 15 Pomodoro durations and supports custom durations', () => {
    const s = useTimerStore.getState();
    expect(s.durationsMin.focus).toBe(25);
    expect(s.durationsMin.short_break).toBe(5);
    expect(s.durationsMin.long_break).toBe(15);

    s.setMode('short_break');
    expect(useTimerStore.getState().remainingSec).toBe(300);

    s.setMode('custom');
    s.setModeDuration('custom', 42);
    expect(useTimerStore.getState().remainingSec).toBe(42 * 60);
  });

  it('handles Start, Pause, Resume, Reset, and drift-free targetEndMs completion', () => {
    const store = useTimerStore.getState();
    store.selectTask('t-1', 'Tulis PRD');
    store.start();
    expect(useTimerStore.getState().status).toBe('running');
    expect(useTimerStore.getState().targetEndMs).toBeGreaterThan(Date.now());

    useTimerStore.getState().pause();
    expect(useTimerStore.getState().status).toBe('paused');
    expect(useTimerStore.getState().targetEndMs).toBeNull();

    useTimerStore.getState().resume();
    expect(useTimerStore.getState().status).toBe('running');

    // Simulate clock passing end time cleanly
    useTimerStore.setState({ targetEndMs: Date.now() - 100 });
    const tickRes = useTimerStore.getState().tick();
    expect(tickRes.finished).toBe(true);
    expect(tickRes.sessionPayload.task_id).toBe('t-1');
    expect(useTimerStore.getState().status).toBe('completed');
    expect(useTimerStore.getState().islandMode).toBe('expanded');

    useTimerStore.getState().setIslandMode('compact');
    expect(useTimerStore.getState().islandMode).toBe('compact');
  });

  it('evaluates D-1 default reminders, custom days before deadline, and natural English reminder copy', () => {
    const todayIso = '2026-11-19';
    const tomorrowTask = {
      id: 'rem-1',
      title: 'Submit Sprint Report',
      due_date: '2026-11-20',
      semantic_type: 'todo',
    };
    const customTask = {
      id: 'rem-2',
      title: 'Roadmap Presentation',
      due_date: '2026-11-22',
      reminder_days_before: 3,
      semantic_type: 'in_progress',
    };
    const futureTask = {
      id: 'rem-3',
      title: 'Next Week Audit',
      due_date: '2026-11-28',
      reminder_days_before: 2,
      semantic_type: 'todo',
    };
    const disabledTask = {
      id: 'rem-4',
      title: 'No Reminder',
      due_date: '2026-11-20',
      reminder_days_before: null,
      semantic_type: 'todo',
    };

    expect(resolveTaskReminderDays(tomorrowTask, 1)).toBe(1);
    expect(getTaskReminderDateIso('2026-11-22', 3)).toBe('2026-11-19');

    const { dueNow, scheduled } = evaluateTaskReminders(
      [tomorrowTask, customTask, futureTask, disabledTask],
      { todayIso, defaultDays: 1 }
    );

    expect(dueNow.map((x) => x.task.id)).toEqual(['rem-1', 'rem-2']);
    expect(dueNow[0].badgeLabel).toBe('D-1');
    expect(dueNow[0].message).toContain('Don\'t forget, you have task "Submit Sprint Report"');
    expect(dueNow[0].message).toContain('November 20, 2026');

    expect(dueNow[1].badgeLabel).toBe('D-3');
    expect(dueNow[1].message).toContain('November 22, 2026');

    expect(scheduled.length).toBe(1);
    expect(scheduled[0].task.id).toBe('rem-3');
    expect(scheduled[0].reminderDateIso).toBe('2026-11-26');

    const todayCopy = formatReminderMessage({ title: 'Client Demo', due_date: '2026-11-19' }, todayIso);
    expect(todayCopy.urgency).toBe('today');
    expect(todayCopy.message).toContain('due today');
  });

  it('formats clocks, durations, date ranges, and overdue flags accurately', () => {
    expect(formatSecondsClock(1500)).toBe('25:00');
    expect(formatSecondsClock(3665)).toBe('01:01:05');
    expect(formatDurationHuman(5400)).toBe('1h 30m');
    expect(dateRangeDays('2026-11-15', '2026-11-17')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    expect(isTaskOverdue('2020-01-01', 'todo')).toBe(true);
    expect(isTaskOverdue('2020-01-01', 'done')).toBe(false);
  });
});

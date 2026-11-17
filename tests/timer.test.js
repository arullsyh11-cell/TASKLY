import { describe, it, expect, beforeEach } from 'vitest';
import { useTimerStore } from '../src/stores/useTimerStore.js';
import { dateRangeDays, formatDurationHuman, formatSecondsClock, isTaskOverdue } from '../src/utils/dateUtils.js';

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
  });

  it('formats clocks, durations, date ranges, and overdue flags accurately', () => {
    expect(formatSecondsClock(1500)).toBe('25:00');
    expect(formatSecondsClock(3665)).toBe('01:01:05');
    expect(formatDurationHuman(5400)).toBe('1j 30m');
    expect(dateRangeDays('2026-11-15', '2026-11-17')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    expect(isTaskOverdue('2020-01-01', 'todo')).toBe(true);
    expect(isTaskOverdue('2020-01-01', 'done')).toBe(false);
  });
});

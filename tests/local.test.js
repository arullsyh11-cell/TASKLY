import { describe, it, expect, beforeEach } from 'vitest';
import { localStorageAdapter } from '../src/services/repositories/localStorageAdapter.js';

describe('TASKLY LocalStorage Adapter', () => {
  beforeEach(async () => {
    localStorage.clear();
    await localStorageAdapter.settings.resetWorkspace();
  });

  it('bootstraps 5 default columns and supports custom column creation + safe task migration', async () => {
    const cols = await localStorageAdapter.columns.list();
    expect(cols.map((c) => c.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);

    const custom = await localStorageAdapter.columns.create({ name: 'QA Check', semantic_type: 'review' });
    const t = await localStorageAdapter.tasks.create({ title: 'Uji integrasi lokal', column_id: custom.id });

    await expect(localStorageAdapter.columns.remove(custom.id)).rejects.toThrow();

    const todoCol = cols.find((c) => c.semantic_type === 'todo');
    const res = await localStorageAdapter.columns.remove(custom.id, todoCol.id);
    expect(res.migratedCount).toBe(1);

    const movedTask = await localStorageAdapter.tasks.get(t.id);
    expect(movedTask.column_id).toBe(todoCol.id);
  });

  it('persists tasks, subtasks, sprints, burndown, focus sessions, and exports', async () => {
    const cols = await localStorageAdapter.columns.list();
    const doneCol = cols.find((c) => c.semantic_type === 'done');

    const task = await localStorageAdapter.tasks.create({ title: 'Selesaikan modul lokal', priority: 'high' });
    await localStorageAdapter.tasks.addSubtask(task.id, 'Cek simpanan browser');

    const sprint = await localStorageAdapter.sprints.create({
      name: 'Sprint Lokal 01',
      goal: 'Validasi persistence',
      start_date: '2026-11-15',
      end_date: '2026-11-20',
      status: 'active',
    });
    await localStorageAdapter.sprints.assignTask(sprint.id, task.id, 'add');
    await localStorageAdapter.tasks.update(task.id, { column_id: doneCol.id });

    const detail = await localStorageAdapter.sprints.detail(sprint.id);
    expect(detail.sprint.progress_percent).toBe(100);
    expect(detail.burndown.length).toBe(6);

    await localStorageAdapter.focus.logSession({
      task_id: task.id,
      mode: 'focus',
      planned_duration_sec: 1500,
      actual_duration_sec: 1500,
      status: 'completed',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    });

    const dash = await localStorageAdapter.dashboard.getSummary();
    expect(dash.counts.completed).toBe(1);
    expect(dash.daily_overview.focus_sessions_today).toBe(1);

    const exportedJson = await localStorageAdapter.settings.exportJson();
    expect(exportedJson.storage_mode).toBe('localStorage');
    expect(exportedJson.tasks.length).toBe(1);

    const exportedCsv = await localStorageAdapter.settings.exportCsv();
    expect(exportedCsv).toContain('Selesaikan modul lokal');
  });
});

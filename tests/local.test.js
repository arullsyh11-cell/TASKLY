import { describe, it, expect, beforeEach } from 'vitest';
import { localStorageAdapter } from '../src/services/repositories/localStorageAdapter.js';
import { vaultService } from '../src/services/vaultService.js';

describe('TASKLY LocalStorage Adapter & Workspace Vault', () => {
  beforeEach(async () => {
    localStorage.clear();
    await localStorageAdapter.settings.resetWorkspace();
  });

  it('bootstraps 5 default columns and supports custom column creation + safe task migration', async () => {
    const cols = await localStorageAdapter.columns.list();
    expect(cols.map((c) => c.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);

    const custom = await localStorageAdapter.columns.create({ name: 'QA Check', semantic_type: 'review' });
    const t = await localStorageAdapter.tasks.create({ title: 'Test local integration', column_id: custom.id });

    await expect(localStorageAdapter.columns.remove(custom.id)).rejects.toThrow();

    const todoCol = cols.find((c) => c.semantic_type === 'todo');
    const res = await localStorageAdapter.columns.remove(custom.id, todoCol.id);
    expect(res.migratedCount).toBe(1);

    const movedTask = await localStorageAdapter.tasks.get(t.id);
    expect(movedTask.column_id).toBe(todoCol.id);
  });

  it('persists tasks, subtasks, sprints, burndown, focus sessions, vault files/notes, and exports', async () => {
    const cols = await localStorageAdapter.columns.list();
    const doneCol = cols.find((c) => c.semantic_type === 'done');

    const task = await localStorageAdapter.tasks.create({
      title: 'Finish local module',
      priority: 'high',
      due_date: '2026-11-25',
      reminder_days_before: 3,
    });
    expect(task.reminder_days_before).toBe(3);

    await localStorageAdapter.settings.update({ default_reminder_days: 2, reminder_enabled: true });
    const defaultRemTask = await localStorageAdapter.tasks.create({
      title: 'Task inheriting default reminder',
      due_date: '2026-11-28',
    });
    expect(defaultRemTask.reminder_days_before).toBe(2);

    await localStorageAdapter.tasks.addSubtask(task.id, 'Verify browser storage');

    const sprint = await localStorageAdapter.sprints.create({
      name: 'Local Sprint 01',
      goal: 'Validate persistence',
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

    // Vault: folder + file + quick note
    const folder = await vaultService.createFolder({ name: 'Reference Docs' });
    const sampleFile = new File(['Hello TASKLY'], 'brief.txt', { type: 'text/plain' });
    const uploadRes = await vaultService.uploadFiles([sampleFile], folder.id);
    expect(uploadRes.addedFiles.length).toBe(1);
    const note = await vaultService.createNote({
      title: 'Standup Note',
      content: 'Ship English localization and Settings Vault.',
      pinned: true,
    });
    expect(note.pinned).toBe(true);

    const dash = await localStorageAdapter.dashboard.getSummary();
    expect(dash.counts.completed).toBe(1);
    expect(dash.daily_overview.focus_sessions_today).toBe(1);

    const exportedJson = await localStorageAdapter.settings.exportJson();
    expect(exportedJson.storage_mode).toBe('localStorage');
    expect(exportedJson.tasks.length).toBe(2);
    expect(exportedJson.vault.folders.length).toBe(1);
    expect(exportedJson.vault.files.length).toBe(1);
    expect(exportedJson.vault.notes.length).toBe(1);

    const exportedCsv = await localStorageAdapter.settings.exportCsv();
    expect(exportedCsv).toContain('Finish local module');
    expect(exportedCsv).toContain('Reminder');
  });
});
